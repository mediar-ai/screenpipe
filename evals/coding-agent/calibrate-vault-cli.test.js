// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
const repo = path.resolve(import.meta.dir,'../..');
const output = process.env.EVAL_CALIBRATION_DIR ? path.resolve(process.env.EVAL_CALIBRATION_DIR) : fs.mkdtempSync(path.join(os.tmpdir(),'vault-calibration-'));
const parent='5dd6c7f0db9a38aa1ffbf71ae9bf5ef46f420a6d', fixed='7d171cc2de988c92b0d38a940fecd8dfb27816b0';
const cli='crates/screenpipe-engine/src/cli/vault.rs', manager='crates/screenpipe-vault/src/manager.rs';
function git(...args){const z=spawnSync('git',['-C',repo,...args],{maxBuffer:20*1024*1024});if(z.status!==0)throw new Error(z.stderr.toString());return z.stdout;}
function mutate(dir,file,from,to){const p=path.join(dir,file),s=fs.readFileSync(p,'utf8');if(!s.includes(from))throw new Error('Missing calibration mutation target');fs.writeFileSync(p,s.replace(from,to));}
const controls=[
 ['parent',parent,'fail'],['reference',fixed,'pass'],['current','HEAD','pass'],
 ['equivalent',fixed,'pass',d=>mutate(d,manager,'let key_bytes: [u8; KEY_SIZE] = *key;','let key_bytes = <[u8; KEY_SIZE]>::clone(&*key);')],
 ['unused-helper',parent,'fail',d=>fs.appendFileSync(path.join(d,cli),'\nfn unused_recovery_example(password: &str) -> bool { !password.is_empty() }\n')],
 ['response-only',fixed,'fail',d=>mutate(d,cli,'let _progress_rx = vault.lock(&password).await?;','println!("vault locked"); return Ok(());')],
 ['refuse-all',fixed,'fail',d=>mutate(d,cli,'let _progress_rx = vault.lock(&password).await?;','anyhow::bail!("refused");')],
 ['skip-media',fixed,'fail',d=>mutate(d,manager,'if data_dir.exists() {','if false {')],
 ['ignore-lock-password',fixed,'fail',d=>mutate(d,manager,'crypto::derive_key(password, &meta.salt)?','crypto::derive_key("synthetic-vault-password", &meta.salt)?')],
 ['missing-source',fixed,'error',d=>fs.unlinkSync(path.join(d,cli))],
];
test('vault actual CLI outcomes accept equivalent fixes and reject incomplete repairs',()=>{
 fs.mkdirSync(output,{recursive:true});const results=[];
 for(const [name,ref,expected,edit] of controls){
  const d=path.join(output,name);fs.mkdirSync(d,{recursive:true});
  const files=[...git('ls-tree','-r','--name-only',ref,'crates/screenpipe-vault').toString().trim().split('\n'),cli,'Cargo.toml','Cargo.lock','crates/screenpipe-engine/Cargo.toml'];
  for(const file of files){fs.mkdirSync(path.dirname(path.join(d,file)),{recursive:true});fs.writeFileSync(path.join(d,file),git('show',ref+':'+file));}
  if(edit)edit(d);
  const fixture=path.join(d,'vault-cli.fixture.js');fs.copyFileSync(path.join(import.meta.dir,'graders/vault-cli.fixture.js'),fixture);
  const z=spawnSync(process.execPath,['--no-env-file',fixture],{cwd:d,encoding:'utf8',timeout:250000,maxBuffer:20*1024*1024});
  fs.writeFileSync(path.join(output,name+'.stdout'),z.stdout ?? '');fs.writeFileSync(path.join(output,name+'.stderr'),z.stderr ?? '');
  const result=JSON.parse(z.stdout);const observed=z.status===127?'error':z.status===0?'pass':z.status===1?'fail':'error';
  results.push({name,expected,observed,exit:z.status,result});fs.writeFileSync(path.join(output,'calibration.json'),JSON.stringify(results,null,2)+'\n');
  expect(observed, name+' '+JSON.stringify(result)).toBe(expected);
  if(expected!=='error'){expect(result.infrastructure_error).toBeNull();expect(result.outcomes).toHaveLength(4);}
 }
},2400000);
