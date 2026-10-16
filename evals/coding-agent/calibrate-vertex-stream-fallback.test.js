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
const item = JSON.parse(readFileSync(join(import.meta.dir, 'cases.json'))).cases.find(c => c.id === 'ai-gateway-vertex-stream-fallback');
const sourcePath = item.oracle_paths[0];
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const source = ref => git('show', `${ref}:${sourcePath}`);
const parent = source(item.base_ref), fixed = source(item.oracle_ref);
const fixture = readFileSync(join(import.meta.dir, 'graders/vertex-stream-fallback.fixture.ts.txt'));
const hash = x => createHash('sha256').update(x).digest('hex');
function change(from, to) { expect(fixed.split(from)).toHaveLength(2); return fixed.replace(from, to); }
const controls = [
  ['parent', parent, 'fail', item.base_ref],
  ['reference', fixed, 'pass', item.base_ref],
  ['current', source('HEAD'), 'pass', 'HEAD'],
  ['equivalent', change('injected || contentEmitted || !reasoningBuffer || !lastTemplate', '[injected, contentEmitted, reasoningBuffer.length === 0, !lastTemplate].some(Boolean)'), 'pass', item.base_ref],
  ['unused-correct', parent, 'fail', item.base_ref],
  ['disconnected-transform', change('return response.body!.pipeThrough(promoteReasoningStream());','return response.body!;'), 'fail', item.base_ref],
  ['duplicate-injection', change('injected = true;', 'injected = false;'), 'fail', item.base_ref],
  ['overwrite-answer', change('injected || contentEmitted || !reasoningBuffer || !lastTemplate', 'injected || !reasoningBuffer || !lastTemplate'), 'fail', item.base_ref],
  ['lose-reasoning-pass-through', fixed.replaceAll("controller.enqueue(encoder.encode(line + '\\n'));", "if (!line.includes('reasoning_content')) controller.enqueue(encoder.encode(line + '\\n'));"), 'fail', item.base_ref],
  ['missing-source', null, 'error', item.base_ref],
];
for (const [name, body, expected, supportingRef] of controls) test(`Vertex stream fallback calibration: ${name}`, () => {
  const root = mkdtempSync(join(tmpdir(), 'vertex-stream-fallback-'));
  try {
    const fingerprints = {};
    for (const path of ['packages/ai-gateway/src/providers/vertex.ts', 'packages/ai-gateway/src/providers/base.ts', 'packages/ai-gateway/src/types.ts']) {
      const bytes = git('show', `${supportingRef}:${path}`); const destination = join(root, path);
      mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, bytes); fingerprints[path] = hash(bytes);
    }
    if (body !== null) writeFileSync(join(root, sourcePath), body);
    if (name === 'unused-correct') writeFileSync(join(root, 'unused-correct.ts'), fixed);
    writeFileSync(join(root, 'packages/ai-gateway/eval-vertex-stream-fallback.test.ts'), fixture);
    const result = spawnSync(process.execPath, ['--no-env-file', 'test', 'packages/ai-gateway/eval-vertex-stream-fallback.test.ts'], { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    const kind = classifyGraderError(result);
    const observed = result.error || result.signal || kind ? 'error' : result.status === 0 ? 'pass' : 'fail';
    if (process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS) {
      const dir = resolve(process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS); mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${name}.json`), JSON.stringify({ command: item.grader.command, expected, observed, exit: result.status, signal: result.signal, error: result.error?.message ?? null, error_kind: kind, supporting_ref: supportingRef, source_sha256: body === null ? null : hash(body), supporting_sha256: fingerprints, fixture_sha256: hash(fixture), stdout: result.stdout, stderr: result.stderr }, null, 2));
    }
    expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(observed).toBe(expected);
    if (expected === 'pass') expect(result.stderr).toContain('12 pass');
    if (name === 'parent' || name === 'unused-correct') { expect(result.stderr).toContain('6 fail'); expect(result.stderr).toContain('6 pass'); }
    if (name === 'missing-source') expect(kind).toBe('bun_unhandled_error');
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 65000);
