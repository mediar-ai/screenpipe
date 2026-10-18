// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { afterAll, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { classifyGraderError } from './grader-outcome.mjs';
const repo = resolve(import.meta.dir, '../..');
const item = JSON.parse(readFileSync(join(import.meta.dir, 'cases.json'), 'utf8')).cases.find(c => c.id === 'app-shared-inventory-duplicate-devices');
const receipts = process.env.EVAL_CALIBRATION_RESULTS_DIR;
if (receipts) mkdirSync(receipts, { recursive: true });
const cwd = mkdtempSync(join(receipts || tmpdir(), 'audio-inventory-calibration-'));
const source = 'crates/screenpipe-audio/src/core/device.rs';
const fixture = readFileSync(join(import.meta.dir, 'graders/audio-inventory.fixture.rs'), 'utf8');
const fixed = execFileSync('git', ['show', `${item.oracle_ref}:${source}`], { cwd: repo, encoding: 'utf8' });
const dedup = '    let mut seen = HashSet::with_capacity(devices.len());\n    devices.retain(|device| seen.insert(device.clone()));';
afterAll(() => { if (!receipts) rmSync(cwd, { recursive: true, force: true }); });
function replace(text, from, to) { expect(text.split(from)).toHaveLength(2); return text.replace(from, to); }
function grade(name, ref, mutate = text => text, unusedCorrect = false) {
  const archive = execFileSync('git', ['archive', ref, 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', '.cargo', 'crates'], { cwd: repo, maxBuffer: 64 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', cwd], { input: archive });
  writeFileSync(join(cwd, source), mutate(readFileSync(join(cwd, source), 'utf8')) + '\n' + fixture);
  const unused = join(cwd, 'crates/screenpipe-audio/src/core/unused_correct.rs');
  if (unusedCorrect) writeFileSync(unused, fixed);
  const r = spawnSync('cargo', ['test', '--locked', '-p', 'screenpipe-audio', '--lib', 'eval_audio_inventory', '--', '--test-threads=1'], { cwd, encoding: 'utf8', timeout: 180_000 });
  if (unusedCorrect) rmSync(unused);
  if (receipts) writeFileSync(join(receipts, name + '.json'), JSON.stringify({ ref, status: r.status, signal: r.signal, error: r.error?.message, stdout: r.stdout, stderr: r.stderr, failure_kind: classifyGraderError(r) }, null, 2));
  expect(r.error).toBeUndefined(); expect(r.signal).toBeNull(); expect(r.stdout).toContain('running 7 tests'); expect(classifyGraderError(r)).toBeNull();
  return r;
}
function fails(r) { expect(r.status).toBe(101); expect(r.stdout).toContain('test result: FAILED.'); }
test('parent fails duplicate inventories and preserves five neighbors', () => { const r = grade('parent', item.base_ref); fails(r); expect(r.stdout).toContain('5 passed; 2 failed'); }, 200_000);
test('reference passes every outcome', () => { const r = grade('reference', item.oracle_ref); expect(r.status).toBe(0); expect(r.stdout).toContain('7 passed'); }, 200_000);
test('equivalent stable vector strategy is accepted', () => expect(grade('equivalent', item.oracle_ref, t => replace(t, dedup, '    let mut seen = Vec::new();\n    devices.retain(|device| { if seen.contains(device) { false } else { seen.push(device.clone()); true } });')).status).toBe(0), 200_000);
test('name-only deduplication is rejected', () => fails(grade('name-only', item.oracle_ref, t => replace(t, 'seen.insert(device.clone())', 'seen.insert(device.name.clone())'))), 200_000);
test('sorting the inventory is rejected', () => fails(grade('sorting', item.oracle_ref, t => replace(t, dedup, dedup + '\n    devices.sort_by(|a, b| a.name.cmp(&b.name));'))), 200_000);
test('returning raw duplicates despite a correct cache is rejected', () => fails(grade('raw-return', item.oracle_ref, t => replace(replace(t, '    let mut devices = enumerate().await?;', '    let mut devices = enumerate().await?;\n    let raw_devices = devices.clone();'), '    Ok(devices)\n}', '    Ok(raw_devices)\n}'))), 200_000);
test('bypassing the cache is rejected', () => fails(grade('no-cache', item.oracle_ref, t => replace(t, 'if c.topology_generation == topology_generation && c.fetched_at.elapsed() < DEVICE_CACHE_TTL', 'if false && c.topology_generation == topology_generation && c.fetched_at.elapsed() < DEVICE_CACHE_TTL'))), 200_000);
test('unused correct code cannot hide broken inventory', () => fails(grade('unused-correct', item.base_ref, t => t, true)), 200_000);
test('consuming events during enumeration is rejected', () => fails(grade('lost-event', item.oracle_ref, t => replace(t, '        topology_generation,\n    });', '        topology_generation: generation(),\n    });'))), 200_000);
