// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { classifyGraderError } from './grader-outcome.mjs';
const repo = resolve(import.meta.dir, '../..');
const item = JSON.parse(readFileSync(join(import.meta.dir, 'cases.json'))).cases.find(x => x.id === 'app-acp-declined-warmup');
const sourcePath = item.oracle_paths[0];
const source = ref => execFileSync('git', ['show', `${ref}:${sourcePath}`], { cwd: repo, encoding: 'utf8' });
const parent = source(item.base_ref), fixed = source(item.oracle_ref);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function change(from, to) { expect(fixed.split(from)).toHaveLength(2); return fixed.replace(from, to); }
const controls = [
  ['parent', parent, 'fail'], ['reference', fixed, 'pass'], ['current', source('HEAD'), 'pass'],
  ['equivalent', fixed.replace('new Set<string>()', 'new Map<string, boolean>()').replace('pendingOrFailedWarmups.add(agentKey)', 'pendingOrFailedWarmups.set(agentKey, true)'), 'pass'],
  ['unused-correct', parent, 'fail'], ['no-op-package-script', parent, 'fail'],
  ['blanket-no-warmup', 'export function useAcpWarmup() {}', 'fail'],
  ['all-agents-blocked', change('JSON.stringify([presetId, agentId])', '"shared-key"'), 'fail'],
  ['success-stays-blocked', change('pendingOrFailedWarmups.delete(agentKey);', '// Synthetic failure to release successful key.'), 'fail'],
  ['disabled-start', change('if (!enabled) return;', '// Synthetic removed feature guard.'), 'fail'],
  ['liveness-releases-guard', change('[enabled, provider, presetId, agentId, sessionId]', '[enabled, provider, presetId, agentId, sessionId, piInfo?.running]'), 'fail'],
  ['missing-source', null, 'error'],
];
for (const [name, body, expected] of controls) test(`ACP warmup calibration: ${name}`, () => {
  const root = mkdtempSync(join(tmpdir(), 'acp-warmup-calibration-'));
  try {
    const app = join(root, 'apps/screenpipe-app-tauri');
    mkdirSync(dirname(join(root, sourcePath)), { recursive: true });
    if (body !== null) writeFileSync(join(root, sourcePath), body);
    mkdirSync(join(app, 'lib/utils'), { recursive: true });
    writeFileSync(join(app, 'lib/utils/tauri.ts'), 'export const commands = {};');
    symlinkSync(join(repo, 'apps/screenpipe-app-tauri/node_modules'), join(app, 'node_modules'), 'dir');
    const fixtureHashes = {};
    for (const f of item.grader.fixtures) {
      const bytes = readFileSync(join(import.meta.dir, f.local_path));
      writeFileSync(join(root, f.destination_path), bytes); fixtureHashes[f.local_path] = hash(bytes);
    }
    if (name === 'unused-correct') writeFileSync(join(app, 'unused-correct.ts'), fixed);
    if (name === 'no-op-package-script') writeFileSync(join(app, 'package.json'), JSON.stringify({ scripts: { test: 'exit 0', 'test:eval': 'exit 0' } }));
    const command = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'eval-acp-warmup.config.mjs'];
    const result = spawnSync(command[0], command.slice(1), { cwd: app, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    const kind = classifyGraderError(result);
    const observed = result.error || result.signal || kind ? 'error' : result.status === 0 ? 'pass' : 'fail';
    if (process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS) {
      const dir = resolve(process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS); mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${name}.json`), JSON.stringify({ command, expected, observed, exit: result.status, signal: result.signal, error: result.error?.message ?? null, error_kind: kind, source_sha256: body === null ? null : hash(body), fixture_sha256: fixtureHashes, stdout: result.stdout, stderr: result.stderr }, null, 2));
    }
    expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(observed).toBe(expected);
    if (expected === 'pass') expect(result.stdout).toContain('15 passed');
    if (['parent', 'unused-correct', 'no-op-package-script'].includes(name)) {
      expect(result.stdout).toContain('4 failed | 11 passed');
      expect(result.stderr).toContain('unsuccessful cancelled');
      expect(result.stderr).toContain('pending attempt is not duplicated');
    }
    if (name === 'disabled-start') expect(result.stderr).toContain('preserves disabled start guard');
    if (name === 'missing-source') expect(kind).toBe('vitest_collection_error');
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 65000);
