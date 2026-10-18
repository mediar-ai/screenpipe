// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { afterAll, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { classifyGraderError } from './grader-outcome.mjs';
const repo = resolve(import.meta.dir, '../..');
const item = JSON.parse(readFileSync(join(import.meta.dir, 'cases.json'), 'utf8')).cases.find(c => c.id === 'app-audio-drop-control-dispatch');
const receipts = process.env.EVAL_CALIBRATION_RESULTS_DIR;
if (receipts) mkdirSync(receipts, { recursive: true });
const cwd = mkdtempSync(join(receipts || tmpdir(), 'audio-drop-calibration-'));
const source = 'crates/screenpipe-audio/src/core/stream.rs';
const fixed = execFileSync('git', ['show', `${item.oracle_ref}:${source}`], { cwd: repo, encoding: 'utf8' });
const fixture = readFileSync(join(import.meta.dir, 'graders/audio-drop.fixture.rs'), 'utf8');
const dropBody = `        let _ = self
            .stream_control
            .send(StreamControl::stop_without_wait(StopMode::Immediate));
        self.is_disconnected.store(true, Ordering::Relaxed);`;
const flag = '        self.is_disconnected.store(true, Ordering::Relaxed);';
afterAll(() => { if (!receipts) rmSync(cwd, { recursive: true, force: true }); });
function replace(text, from, to) { expect(text.split(from)).toHaveLength(2); return text.replace(from, to); }
function grade(name, ref, mutate = text => text, unusedCorrect = false) {
  const archive = execFileSync('git', ['archive', ref, 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', '.cargo', 'crates'], { cwd: repo, maxBuffer: 64 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', cwd], { input: archive });
  const path = join(cwd, source), body = mutate(readFileSync(path, 'utf8'));
  writeFileSync(path, body + '\n' + fixture);
  const unused = join(cwd, 'crates/screenpipe-audio/src/core/unused_correct.rs');
  if (unusedCorrect) writeFileSync(unused, fixed);
  const env = { ...process.env };
  if (process.env.SCREENPIPE_EVAL_CARGO_TARGET_DIR) env.CARGO_TARGET_DIR = process.env.SCREENPIPE_EVAL_CARGO_TARGET_DIR;
  const r = spawnSync('cargo', ['test', '--locked', '-p', 'screenpipe-audio', '--lib', 'eval_audio_drop', '--', '--test-threads=1'], { cwd, env, encoding: 'utf8', timeout: 180_000 });
  if (unusedCorrect) rmSync(unused);
  if (receipts) writeFileSync(join(receipts, name + '.json'), JSON.stringify({ ref, status: r.status, signal: r.signal, error: r.error?.message, stdout: r.stdout, stderr: r.stderr, failure_kind: classifyGraderError(r) }, null, 2));
  expect(r.error).toBeUndefined(); expect(r.signal).toBeNull(); expect(r.stdout).toContain('running 5 tests'); expect(classifyGraderError(r)).toBeNull();
  return r;
}
function fails(r, count) { expect(r.status).toBe(101); expect(r.stdout).toContain(`${count} failed`); }
test('parent fails three Drop outcomes and preserves two neighbors', () => { const r = grade('parent', item.base_ref); fails(r, 3); expect(r.stdout).toContain('2 passed'); }, 200_000);
test('reference passes all five outcomes', () => { const r = grade('reference', item.oracle_ref); expect(r.status).toBe(0); expect(r.stdout).toContain('5 passed'); }, 200_000);
test('equivalent ordering is accepted', () => expect(grade('equivalent', item.oracle_ref, t => replace(t, dropBody, flag + '\n' + dropBody.replace('\n' + flag, ''))).status).toBe(0), 200_000);
test('missing disconnect state is rejected', () => fails(grade('missing-disconnect', item.oracle_ref, t => replace(t, dropBody, dropBody.replace('\n' + flag, ''))), 2), 200_000);
test('missing control dispatch is rejected', () => fails(grade('missing-send', item.oracle_ref, t => replace(t, dropBody, flag)), 1), 200_000);
test('unused correct code cannot hide broken Drop', () => fails(grade('unused-correct', item.oracle_ref, t => replace(t, dropBody, ''), true), 3), 200_000);
test('preserved explicit stop remains required', () => fails(grade('broken-stop', item.oracle_ref, t => replace(t, '    pub async fn stop(&self) -> Result<()> {\n' + flag, '    pub async fn stop(&self) -> Result<()> {')), 1), 200_000);
