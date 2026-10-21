// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { afterAll, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { classifyGraderError } from './grader-outcome.mjs';
const repo = resolve(import.meta.dir, '../..');
const item = JSON.parse(readFileSync(join(import.meta.dir, 'cases.json'), 'utf8')).cases.find(c => c.id === 'app-manual-pipe-instruction-preservation');
const receipts = process.env.EVAL_CALIBRATION_RESULTS_DIR;
if (receipts) mkdirSync(receipts, { recursive: true });
const cwd = mkdtempSync(join(receipts || tmpdir(), 'pipe-prompt-calibration-'));
const source = 'crates/screenpipe-core/src/pipes/mod.rs';
const fixed = execFileSync('git', ['show', `${item.oracle_ref}:${source}`], { cwd: repo, encoding: 'utf8' });
afterAll(() => { if (!receipts) rmSync(cwd, { recursive: true, force: true }); });
function replace(text, from, to, count = 1) { expect(text.split(from)).toHaveLength(count + 1); return text.replaceAll(from, to); }
function grade(name, ref, mutate = t => t, options = {}) {
  const archive = execFileSync('git', ['archive', ref, 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', '.cargo', 'crates'], { cwd: repo, maxBuffer: 64 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', cwd], { input: archive });
  writeFileSync(join(cwd, source), mutate(readFileSync(join(cwd, source), 'utf8')));
  for (const fixture of item.grader.fixtures) {
    const target = join(cwd, fixture.destination_path);
    mkdirSync(join(cwd, '.eval-pipe-prompt'), { recursive: true });
    copyFileSync(join(import.meta.dir, fixture.local_path), target);
  }
  const unused = join(cwd, 'crates/screenpipe-core/src/pipes/unused_correct.rs');
  if (options.unused) writeFileSync(unused, fixed);
  if (options.missing) rmSync(join(cwd, source));
  const result = spawnSync('/bin/bash', ['-lc', item.grader.command], { cwd, encoding: 'utf8', timeout: 180_000 });
  if (options.unused) rmSync(unused);
  if (receipts) writeFileSync(join(receipts, name + '.json'), JSON.stringify({ ref, command: item.grader.command, status: result.status, signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr, failure_kind: classifyGraderError(result) }, null, 2));
  expect(result.error).toBeUndefined(); expect(result.signal).toBeNull();
  if (!options.missing) { expect(result.stdout).toContain('running 15 tests'); expect(classifyGraderError(result)).toBeNull(); }
  return result;
}
function fails(r) { expect(r.status).toBe(101); expect(r.stdout).toContain('test result: FAILED.'); }
test('parent loses six manual instruction outcomes and preserves nine neighbors', () => { const r=grade('parent',item.base_ref); fails(r); expect(r.stdout).toContain('9 passed; 6 failed'); },200_000);
test('reference preserves all fifteen outcomes', () => { const r=grade('reference',item.oracle_ref); expect(r.status).toBe(0); expect(r.stdout).toContain('15 passed'); },200_000);
test('equivalent combined user-channel instructions are accepted', () => {
  const r=grade('equivalent',item.oracle_ref,t=>replace(replace(t,'                    &prompt,','                    &format!("{}\\n{}", pipe_system_prompt, prompt),',3),'Some(&pipe_system_prompt),','None,',3));
  expect(r.status).toBe(0);
},200_000);
test('unused correct code cannot hide the broken callers',()=>fails(grade('unused-correct',item.base_ref,t=>t,{unused:true})),200_000);
test('fixing only the foreground caller is insufficient',()=>fails(grade('background-disconnected',item.oracle_ref,t=>{ expect(t.split('Some(&pipe_system_prompt),')).toHaveLength(4); return t.replace('Some(&pipe_system_prompt),','None,'); })),200_000);
test('lost multiline body is rejected',()=>fails(grade('lost-body',item.oracle_ref,t=>replace(t,'    sys.push_str(body);','    sys.push_str("");'))),200_000);
test('lost selected preset is rejected',()=>fails(grade('lost-preset',item.oracle_ref,t=>replace(t,'        sys.push_str(sp);','        sys.push_str("");'))),200_000);
test('hardcoded API endpoint is rejected',()=>fails(grade('wrong-port',item.oracle_ref,t=>replace(t,'localhost:{api_port}','localhost:3030'))),200_000);
test('lost history continuation is rejected',()=>fails(grade('lost-history',item.oracle_ref,t=>replace(t,'                    history_enabled,','                    false,',3))),200_000);
test('missing runtime is a setup error',()=>{const r=grade('missing-source',item.oracle_ref,t=>t,{missing:true});expect(r.status).not.toBe(0);expect(classifyGraderError(r)).toBe('node_missing_module');},200_000);
