// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { classifyGraderError } from './grader-outcome.mjs';
const repo=resolve(import.meta.dir,'../..');
const item=JSON.parse(readFileSync(join(import.meta.dir,'cases.json'))).cases.find(c=>c.id==='app-meeting-background-recovery');
const sourcePath=item.oracle_paths[0];
const source=ref=>execFileSync('git',['show',`${ref}:${sourcePath}`],{cwd:repo,encoding:'utf8'});
const parent=source(item.base_ref),fixed=source(item.oracle_ref);
const fixture=readFileSync(join(import.meta.dir,'graders/meeting-background.fixture.ts.txt'));
const hash=x=>createHash('sha256').update(x).digest('hex');
function change(from,to){expect(fixed.split(from)).toHaveLength(2);return fixed.replace(from,to);}
const controls=[
 ['parent',parent,'fail'],['reference',fixed,'pass'],['current',source('HEAD'),'pass'],
 ['equivalent',change('const merged = sortAudioChunks([...liveRows, ...backgroundRows]);','const merged = sortAudioChunks(liveRows.concat(backgroundRows));'),'pass'],
 ['unused-correct',parent,'fail'],
 ['drop-live',change('return mergeMeetingAudioChunks(routedRows, out, cap);','return mergeMeetingAudioChunks([], out, cap);'),'fail'],
 ['drop-background',change('return mergeMeetingAudioChunks(routedRows, out, cap);','return routedRows;'),'fail'],
 ['reverse-order',change('return mergeMeetingAudioChunks(routedRows, out, cap);','return mergeMeetingAudioChunks(routedRows, out, cap).reverse();'),'fail'],
 ['retain-duplicates',change('if (seen.has(key)) continue;\n    seen.add(key);\n    out.push(chunk);','seen.add(key);\n    out.push(chunk);'),'fail'],
 ['blanket-empty',change('return mergeMeetingAudioChunks(routedRows, out, cap);','return [];'),'fail'],
 ['missing-source',null,'error'],
];
for(const [name,body,expected]of controls)test(`meeting recovery calibration: ${name}`,()=>{
 const root=mkdtempSync(join(tmpdir(),'meeting-recovery-'));
 try{
  const target=join(root,sourcePath);mkdirSync(dirname(target),{recursive:true});
  if(body!==null)writeFileSync(target,body);
  if(name==='unused-correct')writeFileSync(join(root,'unused-correct.ts'),fixed);
  writeFileSync(join(root,item.grader.fixtures[0].destination_path),fixture);
  const result=spawnSync(process.execPath,['--no-env-file','test',item.grader.fixtures[0].destination_path],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
  const kind=classifyGraderError(result);const observed=result.error||result.signal||kind?'error':result.status===0?'pass':'fail';
  if(process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS){const dir=resolve(process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,`${name}.json`),JSON.stringify({expected,observed,exit:result.status,error_kind:kind,source_sha256:body===null?null:hash(body),fixture_sha256:hash(fixture),stdout:result.stdout,stderr:result.stderr},null,2));}
  expect(result.error).toBeUndefined();expect(result.signal).toBeNull();expect(observed).toBe(expected);
  if(expected==='pass')expect(result.stderr).toContain('8 pass');
  if(name==='parent'||name==='unused-correct'){expect(result.stderr).toContain('4 fail');expect(result.stderr).toContain('4 pass');}
  if(name==='missing-source')expect(kind).toBe('bun_unhandled_error');
 }finally{rmSync(root,{recursive:true,force:true});}
},65000);
