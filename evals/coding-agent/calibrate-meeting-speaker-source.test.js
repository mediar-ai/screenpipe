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
const item=JSON.parse(readFileSync(join(import.meta.dir,'cases.json'))).cases.find(c=>c.id==='app-meeting-speaker-source');
const sourcePath=item.oracle_paths[0];
const source=ref=>execFileSync('git',['show',`${ref}:${sourcePath}`],{cwd:repo,encoding:'utf8'});
const parent=source(item.base_ref),fixed=source(item.oracle_ref);
const fixture=readFileSync(join(import.meta.dir,'graders/meeting-speaker-source.fixture.ts.txt'));
const hash=x=>createHash('sha256').update(x).digest('hex');
function change(from,to){expect(fixed.split(from)).toHaveLength(2);return fixed.replace(from,to);}
const controls=[
 ['parent',parent,'fail'],['reference',fixed,'pass'],['current',source('HEAD'),'pass'],
 ['equivalent',change('const speakerName = sourceQualifiedSpeakerName(c.speakerName ?? "", c.deviceType);','const speakerName = sourceQualifiedSpeakerName(c.speakerName == null ? "" : c.speakerName, c.deviceType);'),'pass'],
 ['unused-correct',parent,'fail'],
 ['no-op-script',parent,'fail'],
 ['drop-qualification',change('const speakerName = sourceQualifiedSpeakerName(c.speakerName ?? "", c.deviceType);','const speakerName = c.speakerName ?? "";'),'fail'],
 ['wrong-source',change('direction === "input" ? "Microphone"','direction === "input" ? "Meeting audio"'),'fail'],
 ['lose-grouping',change('if (last && last.speakerName === speakerName && gap < MAX_GAP_MS)', 'if (false && last && last.speakerName === speakerName && gap < MAX_GAP_MS)'),'fail'],
 ['merge-gap-boundary',change('gap < MAX_GAP_MS','gap <= MAX_GAP_MS'),'fail'],
 ['mutate-input',change('const text = c.transcription.replace(/\\s+/g, " ").trim();','c.speakerName = "changed"; const text = c.transcription.replace(/\\s+/g, " ").trim();'),'fail'],
 ['missing-source',null,'error'],
];
for(const [name,body,expected]of controls)test(`speaker source calibration: ${name}`,()=>{
 const root=mkdtempSync(join(tmpdir(),'speaker-source-'));
 try{
  const target=join(root,sourcePath);mkdirSync(dirname(target),{recursive:true});
  if(body!==null)writeFileSync(target,body);
  if(name==='no-op-script')writeFileSync(join(root,'package.json'),JSON.stringify({scripts:{test:'true'}}));
  if(name==='unused-correct')writeFileSync(join(root,'unused-correct.ts'),fixed);
  writeFileSync(join(root,item.grader.fixtures[0].destination_path),fixture);
  const result=spawnSync(process.execPath,['--no-env-file','test',item.grader.fixtures[0].destination_path],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
  const kind=classifyGraderError(result);const observed=result.error||result.signal||kind?'error':result.status===0?'pass':'fail';
  if(process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS){const dir=resolve(process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,`${name}.json`),JSON.stringify({expected,observed,exit:result.status,error_kind:kind,source_sha256:body===null?null:hash(body),fixture_sha256:hash(fixture),stdout:result.stdout,stderr:result.stderr},null,2));}
  expect(result.error).toBeUndefined();expect(result.signal).toBeNull();expect(observed).toBe(expected);
  if(expected==='pass')expect(result.stderr).toContain('12 pass');
  if(name==='parent'||name==='unused-correct'){expect(result.stderr).toContain('5 fail');expect(result.stderr).toContain('7 pass');}
  if(name==='missing-source')expect(kind).toBe('bun_unhandled_error');
 }finally{rmSync(root,{recursive:true,force:true});}
},65000);
