// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import {test,expect} from 'bun:test';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {classifyGraderError} from './grader-outcome.mjs';
const repo=resolve(import.meta.dir,'../..'),prefix='apps/screenpipe-app-tauri/';
const item=JSON.parse(readFileSync(join(import.meta.dir,'cases.json'))).cases.find(x=>x.id==='app-browser-native-consent-navigation');
const paths=['components/browser-sidebar.tsx','lib/hooks/use-tauri-event.ts','lib/owned-browser-ownership.ts'];
const hash=s=>createHash('sha256').update(s).digest('hex');
function changed(files,path,from,to){if(files[path].split(from).length!==2)throw Error('nonunique mutation target');files[path]=files[path].replace(from,to)}
const controls=[
 ['parent',item.base_ref,'fail'],['reference',item.oracle_ref,'pass'],['current','HEAD','pass'],
 ['equivalent',item.oracle_ref,'pass',f=>changed(f,paths[0],'payload?.navigationId ?? payload?.navigation_id','payload?.navigationId != null ? payload.navigationId : payload?.navigation_id')],
 ['unused-correct',item.base_ref,'fail'],['parent-noop-script',item.base_ref,'fail'],['reference-noop-script',item.oracle_ref,'pass'],
 ['foreign-accepted',item.oracle_ref,'fail',f=>changed(f,paths[2],'if (!owner) return true;','return false;\n  if (!owner) return true;')],
 ['stale-accepted',item.oracle_ref,'fail',f=>changed(f,paths[2],'if (!navigationId) return true;','return false;\n  if (!navigationId) return true;')],
 ['choice-inverted',item.oracle_ref,'fail',f=>changed(f,paths[0],'request.requestId,\n          allow,','request.requestId,\n          !allow,')],
 ['missing-source',item.oracle_ref,'error',f=>delete f[paths[0]]],
 ['syntax-error',item.oracle_ref,'error',f=>{f[paths[0]]+='\nexport const broken = ;'}],
];
for(const[name,ref,expected,mutate]of controls)test('browser consent: '+name,()=>{
 const root=mkdtempSync(join(tmpdir(),'browser-consent-cal-')),app=join(root,prefix),files={};
 try{
  for(const path of paths)files[path]=execFileSync('git',['show',ref+':'+prefix+path],{cwd:repo,encoding:'utf8'});
  mutate?.(files);
  for(const[path,body]of Object.entries(files)){mkdirSync(dirname(join(app,path)),{recursive:true});writeFileSync(join(app,path),body)}
  symlinkSync(join(repo,prefix,'node_modules'),join(app,'node_modules'),'dir');
  const fixtures={};for(const f of item.grader.fixtures){const body=readFileSync(join(import.meta.dir,f.local_path));const dest=join(root,f.destination_path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,body);fixtures[f.local_path]=hash(body)}
  if(name==='unused-correct')writeFileSync(join(app,'unused-correct.tsx'),execFileSync('git',['show',item.oracle_ref+':'+prefix+paths[0]],{cwd:repo}));
  if(name.includes('noop-script'))writeFileSync(join(app,'package.json'),JSON.stringify({scripts:{test:'exit 0'}}));
  const command=['node','.eval-browser-consent-bootstrap.mjs'];const result=spawnSync(command[0],command.slice(1),{cwd:app,encoding:'utf8',timeout:70000,maxBuffer:8*1024*1024,env:{PATH:process.env.PATH}});
  const kind=classifyGraderError(result),observed=result.error||result.signal||kind?'error':result.status===0?'pass':'fail';
  const receipt={name,expected,observed,exit:result.status,signal:result.signal,error:result.error?.message??null,error_kind:kind,command,source_sha256:Object.fromEntries(Object.entries(files).map(([p,s])=>[p,hash(s)])),fixture_sha256:fixtures,stdout:result.stdout,stderr:result.stderr};
  if(process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS){const dir=resolve(process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,name+'.json'),JSON.stringify(receipt,null,2))}
  expect(result.error,result.stderr).toBeUndefined();expect(result.signal).toBeNull();expect(observed,result.stdout+result.stderr).toBe(expected);
  if(expected==='pass')expect(result.stdout).toContain('12 passed');
  if(['parent','unused-correct','parent-noop-script'].includes(name)){expect(result.stdout).toContain('4 failed | 8 passed');expect(result.stderr).toContain('consent navigation_id');}
  if(expected==='error')expect(kind).toBe(name==='syntax-error'?'vitest_transform_error':'vitest_collection_error');
 }finally{rmSync(root,{recursive:true,force:true})}
},75000);
