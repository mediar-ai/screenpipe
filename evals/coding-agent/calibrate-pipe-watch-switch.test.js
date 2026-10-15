// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { afterAll, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const repo = resolve(import.meta.dir, '../..'), app = 'apps/screenpipe-app-tauri';
const item = JSON.parse(readFileSync(join(import.meta.dir, 'cases.json'), 'utf8')).cases.find(c => c.id === 'app-pipe-watch-switch-preservation');
const component = `${app}/components/hooks/use-chat-conversations.ts`;
const root = mkdtempSync(join(tmpdir(), 'pipe-watch-switch-calibration-')), archives = new Map();
const receipts = process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS;
afterAll(() => rmSync(root, {recursive: true, force: true}));
function replace(cwd, file, from, to) {
  const p = join(cwd, file), text = readFileSync(p, 'utf8');
  expect(text.split(from)).toHaveLength(2);
  writeFileSync(p, text.replace(from, to));
}
function grade(name, ref = item.oracle_ref, mutate = () => {}) {
  const cwd = join(root, name); mkdirSync(cwd);
  if (!archives.has(ref)) {
    // Archive historical frontend source/config, never node_modules, credentials,
    // native build outputs or future source. No evaluated agent runs here.
    const children = execFileSync('git', ['ls-tree', '--name-only', `${ref}:${app}`], {cwd: repo, encoding: 'utf8'}).trim().split('\n');
    const paths = children.filter(n => !['src-tauri', 'public', 'e2e', '.e2e'].includes(n) && !n.startsWith('.env')).map(n => `${app}/${n}`);

    archives.set(ref, execFileSync('git', ['archive', ref, ...paths], {cwd: repo, maxBuffer: 128 * 1024 * 1024}));
  }
  execFileSync('tar', ['-x', '-C', cwd], {input: archives.get(ref)});
  for (const f of item.grader.fixtures) { const dest = join(cwd, f.destination_path); mkdirSync(dirname(dest), {recursive:true}); writeFileSync(dest, readFileSync(join(import.meta.dir, f.local_path))); }
  symlinkSync(join(repo, app, 'node_modules'), join(cwd, app, 'node_modules'), 'dir');
  mutate(cwd);
  const r = spawnSync('/bin/bash', ['-c', item.grader.command], {cwd, encoding:'utf8', timeout:60000, maxBuffer:4*1024*1024, env:{PATH:process.env.PATH, HOME:cwd, CI:'true', TZ:'UTC', NO_COLOR:'1'}});
  if (receipts) { mkdirSync(receipts,{recursive:true}); writeFileSync(join(receipts, name+'.stdout'), r.stdout||''); writeFileSync(join(receipts,name+'.stderr'),r.stderr||''); writeFileSync(join(receipts,name+'.json'),JSON.stringify({ref,command:item.grader.command,exit_code:r.status,signal:r.signal,error:r.error?.message},null,2)); }
  expect(r.error).toBeUndefined(); expect(r.signal).toBeNull(); return r;
}
function passes(r) { expect(r.status).toBe(0); expect(r.stdout).toContain('4 passed'); expect(r.stdout+r.stderr).not.toMatch(/Unhandled|Uncaught/); }
function fails(r) { expect(r.status).toBe(1); expect(r.stdout).toContain('failed'); expect(r.stdout+r.stderr).not.toMatch(/Unhandled|Uncaught|Failed to resolve import|Failed to load url|Cannot find module/); }
test('parent fails stale watched-pipe text and preserves three controls',()=>{const r=grade('parent',item.base_ref);fails(r);expect(r.stdout).toContain('1 failed | 3 passed');expect(r.stdout).toContain('switch from watched pipe');},60000);
test('reference preserves all four outcomes',()=>passes(grade('reference')),60000);
test('hook-only oracle repairs the parent',()=>passes(grade('oracle-only',item.base_ref,cwd=>writeFileSync(join(cwd,component),execFileSync('git',['show',`${item.oracle_ref}:${component}`],{cwd:repo})))),60000);
test('current hook preserves the historical contract',()=>passes(grade('current','HEAD')),60000);
test('equivalent guard passes',()=>passes(grade('equivalent',item.oracle_ref,cwd=>replace(cwd,component,'if (outgoingKind !== "pipe-watch") {','if (!["pipe-watch"].includes(outgoingKind ?? "")) {'))),60000);
test('unconditional snapshots reject stale pipe text',()=>fails(grade('blind-snapshot',item.oracle_ref,cwd=>replace(cwd,component,'if (outgoingKind !== "pipe-watch") {','if (true) {'))),60000);
test('skipping every snapshot rejects normal chat ownership',()=>fails(grade('skip-all',item.oracle_ref,cwd=>replace(cwd,component,'if (outgoingKind !== "pipe-watch") {','if (false) {'))),60000);
test('no-op navigation rejects incoming chat restoration',()=>fails(grade('noop-load',item.oracle_ref,cwd=>replace(cwd,component,'const loadConversation = async (conv: ChatConversation) => {','const loadConversation = async (conv: ChatConversation) => { return;'))),60000);
test('unused fixed hook cannot hide the broken live hook',()=>fails(grade('unused',item.oracle_ref,cwd=>{writeFileSync(join(cwd,component+'.unused.ts'),readFileSync(join(cwd,component)));writeFileSync(join(cwd,component),execFileSync('git',['show',`${item.base_ref}:${component}`],{cwd:repo}));})),60000);
test('missing hook is a setup error',()=>{const r=grade('missing',item.oracle_ref,cwd=>rmSync(join(cwd,component)));expect(r.status).toBe(1);expect(r.stdout+r.stderr).toMatch(/Failed to resolve import|Failed to load url/);},60000);
