// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { afterAll, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const repo=resolve(import.meta.dir,'../..');
const item=JSON.parse(readFileSync(join(import.meta.dir,'cases.json'),'utf8')).cases.find(c=>c.id==='app-historical-analytics-false-persistence');
const hook='screenpipe-app-tauri/lib/hooks/use-settings.tsx';
const root=mkdtempSync(join(tmpdir(),'settings-falsy-calibration-'));
const receipts=process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS;
afterAll(()=>rmSync(root,{recursive:true,force:true}));
const old='storedValue === null || storedValue === undefined \n      ? defaultSettingsObject[key as keyof Settings]\n      : storedValue';
function replace(cwd,from,to){const p=join(cwd,hook),text=readFileSync(p,'utf8');expect(text.split(from)).toHaveLength(2);writeFileSync(p,text.replace(from,to));}
function grade(name,ref=item.oracle_ref,mutate=()=>{}){
 const cwd=join(root,name);mkdirSync(cwd);mkdirSync(dirname(join(cwd,hook)),{recursive:true});
 writeFileSync(join(cwd,hook),execFileSync('git',['show',`${ref}:${hook}`],{cwd:repo}));
 for(const f of item.grader.fixtures){const dest=join(cwd,f.destination_path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(join(import.meta.dir,f.local_path)));}
 symlinkSync(join(repo,'apps/screenpipe-app-tauri/node_modules'),join(cwd,'screenpipe-app-tauri/node_modules'),'dir');mutate(cwd);
 const r=spawnSync('/bin/bash',['-c',item.grader.command],{cwd,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,env:{PATH:process.env.PATH,HOME:cwd,CI:'true',TZ:'UTC',NO_COLOR:'1'}});
 if(receipts){mkdirSync(receipts,{recursive:true});for(const ext of ['stdout','stderr'])writeFileSync(join(receipts,`${name}.${ext}`),r[ext]||'');writeFileSync(join(receipts,name+'.json'),JSON.stringify({ref,command:item.grader.command,exit_code:r.status,signal:r.signal,error:r.error?.message},null,2));}
 expect(r.error).toBeUndefined();expect(r.signal).toBeNull();return r;
}
function passes(r){expect(r.status).toBe(0);expect(r.stdout).toContain('14 passed');expect(r.stdout+r.stderr).not.toMatch(/Unhandled|Uncaught/);}
function fails(r){expect(r.status).toBe(1);expect(r.stderr).toContain('AssertionError');expect(r.stdout+r.stderr).not.toMatch(/Unhandled|Uncaught|Failed to resolve import|Failed to load url|Cannot find module/);}
test('exact parent fails ten outcomes and preserves four',()=>{const r=grade('parent',item.base_ref);fails(r);expect(r.stdout).toContain('10 failed | 4 passed');},60000);
test('complete historical fix passes fourteen outcomes',()=>passes(grade('reference')),60000);
test('equivalent nullish fallback passes',()=>passes(grade('equivalent',item.oracle_ref,cwd=>replace(cwd,old,'storedValue ?? defaultSettingsObject[key as keyof Settings]'))),60000);
test('unused correct hook cannot hide broken active caller',()=>fails(grade('unused',item.base_ref,cwd=>writeFileSync(join(cwd,'unused-correct.tsx'),execFileSync('git',['show',`${item.oracle_ref}:${hook}`],{cwd:repo})))),60000);
test('blanket defaults lose explicit values',()=>fails(grade('blanket-defaults',item.oracle_ref,cwd=>replace(cwd,old,'defaultSettingsObject[key as keyof Settings]'))),60000);
test('missing defaults fail preserved behavior',()=>fails(grade('missing-defaults',item.oracle_ref,cwd=>replace(cwd,old,'storedValue'))),60000);
test('discarded updates fail reload checks',()=>fails(grade('lost-update',item.oracle_ref,cwd=>replace(cwd,'await store!.set(key, value);','void value;'))),60000);
test('no-op package script cannot bypass outcome grading',()=>{const mutate=cwd=>writeFileSync(join(cwd,'screenpipe-app-tauri/package.json'),JSON.stringify({scripts:{test:'true'}}));passes(grade('noop-reference',item.oracle_ref,mutate));fails(grade('noop-parent',item.base_ref,mutate));},60000);
test('missing hook is classified as setup failure',()=>{const r=grade('missing-source',item.oracle_ref,cwd=>rmSync(join(cwd,hook)));expect(r.status).toBe(1);expect(r.stdout+r.stderr).toMatch(/Failed to resolve import|Failed to load url/);expect(r.stderr).not.toContain('AssertionError');},60000);
