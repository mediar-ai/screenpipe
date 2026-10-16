// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { classifyGraderError } from './grader-outcome.mjs';
const repo = resolve(import.meta.dir, '../..');
const item = JSON.parse(readFileSync(join(import.meta.dir, 'cases.json'))).cases.find(c => c.id === 'app-telemetry-full-ax-wire');
const path = item.oracle_paths[0];
const git = ref => execFileSync('git', ['show', `${ref}:${path}`], { cwd: repo, encoding: 'utf8' });
const parent = git(item.base_ref), fixed = git(item.oracle_ref);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function change(from, to) { expect(fixed.split(from)).toHaveLength(2); return fixed.replace(from, to); }
test('calibrate full accessibility tree wire outcomes and preserved records', () => {
  const controls = [
    ['parent', parent, 'fail'], ['reference', fixed, 'pass'],
    ['current', readFileSync(join(repo, path), 'utf8'), 'pass'],
    ['equivalent', change('#[serde(default, skip_serializing_if = "Option::is_none")]\n    pub accessibility_tree', '#[serde(default)]\n    #[serde(skip_serializing_if = "Option::is_none")]\n    pub accessibility_tree'), 'pass'],
    ['equivalent-field-name', change('pub accessibility_tree: Option<Value>,', '#[serde(rename = "accessibility_tree")]\n    pub retained_tree: Option<Value>,'), 'pass'],
    ['drop-empty-nodes', change('for f in frames {', 'for f in frames {\n        let mut f = f.clone();\n        if let Some(Value::Array(nodes)) = &mut f.accessibility_tree { nodes.retain(|node| node.get("text").and_then(Value::as_str).is_some_and(|s| !s.is_empty())); }'), 'fail'],
    ['truncate-long-values', change('for f in frames {', 'for f in frames {\n        let mut f = f.clone();\n        if let Some(Value::Array(nodes)) = &mut f.accessibility_tree { for node in nodes { if let Some(Value::String(value)) = node.pointer_mut("/properties/value") { value.truncate(100); } } }'), 'fail'],
    ['unused-correct', parent, 'fail'],
    ['drop-tree-output', change('#[serde(default, skip_serializing_if = "Option::is_none")]\n    pub accessibility_tree', '#[serde(default, skip_serializing)]\n    pub accessibility_tree'), 'fail'],
    ['drop-tree-input', change('#[serde(default, skip_serializing_if = "Option::is_none")]\n    pub accessibility_tree', '#[serde(default, skip_deserializing, skip_serializing_if = "Option::is_none")]\n    pub accessibility_tree'), 'fail'],
    ['emit-null-legacy-tree', change('#[serde(default, skip_serializing_if = "Option::is_none")]\n    pub accessibility_tree', '#[serde(default)]\n    pub accessibility_tree'), 'fail'],
    ['drop-audio', change('for a in audio {', 'for a in audio.iter().take(0) {'), 'fail'],
    ['discard-decoded-records', change('Ok(rec) => parsed.records.push(rec),', 'Ok(rec) => { let _ = rec; },'), 'fail'],
    ['lost-malformed-count', change('Err(_) => parsed.skipped_lines += 1,', 'Err(_) => {},'), 'fail'],
    ['missing-source', null, 'error'],
  ];
  for (const [name, source, expected] of controls) {
    const root = mkdtempSync(join(tmpdir(), 'telemetry-ax-calibration-'));
    try {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      if (source !== null) writeFileSync(join(root, path), source);
      if (name === 'unused-correct') writeFileSync(join(root, 'unused-correct.rs'), fixed);
      const fixtureHashes = {};
      for (const fixture of item.grader.fixtures) {
        const bytes = readFileSync(join(import.meta.dir, fixture.local_path));
        const destination = join(root, fixture.destination_path);
        mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, bytes);
        fixtureHashes[fixture.local_path] = hash(bytes);
      }
      const result = spawnSync('/bin/bash', ['-c', item.grader.command], { cwd: root, env: { ...process.env, RUSTUP_TOOLCHAIN: '1.94.0' }, encoding: 'utf8', timeout: item.grader.timeout_seconds * 1000, maxBuffer: 8 * 1024 * 1024 });
      const errorKind = classifyGraderError(result);
      const observed = result.error || result.signal || errorKind ? 'error' : result.status === 0 ? 'pass' : 'fail';
      if (process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS) {
        const dir = resolve(process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS); mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${name}.json`), JSON.stringify({ command: item.grader.command, expected, observed, status: result.status, signal: result.signal, error: result.error?.message ?? null, error_kind: errorKind, source_sha256: source === null ? null : hash(source), fixture_hashes: fixtureHashes, stdout: result.stdout, stderr: result.stderr }, null, 2));
      }
      expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(observed).toBe(expected);
      if (expected === 'pass') expect(result.stdout).toContain('12 passed; 0 failed');
      if (expected === 'fail') { expect(result.status).toBe(101); expect(result.stdout).toContain('test result: FAILED.'); }
      if (name === 'parent' || name === 'unused-correct') expect(result.stdout).toContain('8 passed; 4 failed');
      if (name === 'missing-source') expect(errorKind).toBe('rust_compile_error');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
}, 600_000);
