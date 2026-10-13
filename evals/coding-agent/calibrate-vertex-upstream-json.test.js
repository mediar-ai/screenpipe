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
const item = JSON.parse(readFileSync(join(import.meta.dir, 'cases.json'))).cases.find(c => c.id === 'ai-gateway-vertex-upstream-json');
const sourcePath = item.oracle_paths[0];
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const source = ref => git('show', `${ref}:${sourcePath}`);
const parent = source(item.base_ref), fixed = source(item.oracle_ref);
const fixture = readFileSync(join(import.meta.dir, 'graders/vertex-upstream-json.fixture.ts.txt'));
const hash = x => createHash('sha256').update(x).digest('hex');
function change(from, to) { expect(fixed.split(from)).toHaveLength(2); return fixed.replace(from, to); }
const controls = [
  ['parent', parent, 'fail', item.base_ref],
  ['reference', fixed, 'pass', item.base_ref],
  ['current', source('HEAD'), 'pass', 'HEAD'],
  ['equivalent', change('const result = await parseVertexMaasJsonResponse(response, resolved.vertexId);', "let result; try { result = await response.json(); } catch { throw Object.assign(new Error('Synthetic upstream failure'), { status: 502 }); }"), 'pass', item.base_ref],
  ['unused-correct', parent, 'fail', item.base_ref],
  ['blanket-refusal', change('const result = await parseVertexMaasJsonResponse(response, resolved.vertexId);', "throw Object.assign(new Error('Synthetic refusal'), { status: 502 }); const result = {};"), 'fail', item.base_ref],
  ['wrong-error-status', fixed.replaceAll(', 502);', ', 500);'), 'fail', item.base_ref],
  ['wrong-client-status', change('`Vertex MaaS request failed: ${response.status} ${error}`,\n\t\t\t\tresponse.status,', '`Vertex MaaS request failed: ${response.status} ${error}`,\n\t\t\t\t502,'), 'fail', item.base_ref],
  ['lose-reasoning-fallback', change('promoteReasoningToContent(result);', '// Synthetic omission of reasoning fallback.'), 'fail', item.base_ref],
  ['missing-source', null, 'error', item.base_ref],
];
for (const [name, body, expected, supportingRef] of controls) test(`Vertex upstream JSON calibration: ${name}`, () => {
  const root = mkdtempSync(join(tmpdir(), 'vertex-upstream-json-'));
  try {
    const fingerprints = {};
    for (const path of ['packages/ai-gateway/src/providers/vertex.ts', 'packages/ai-gateway/src/providers/base.ts', 'packages/ai-gateway/src/types.ts']) {
      const bytes = git('show', `${supportingRef}:${path}`); const destination = join(root, path);
      mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, bytes); fingerprints[path] = hash(bytes);
    }
    if (body !== null) writeFileSync(join(root, sourcePath), body);
    if (name === 'unused-correct') writeFileSync(join(root, 'unused-correct.ts'), fixed);
    writeFileSync(join(root, 'packages/ai-gateway/eval-vertex-upstream-json.test.ts'), fixture);
    const result = spawnSync(process.execPath, ['--no-env-file', 'test', 'packages/ai-gateway/eval-vertex-upstream-json.test.ts'], { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    const kind = classifyGraderError(result);
    const observed = result.error || result.signal || kind ? 'error' : result.status === 0 ? 'pass' : 'fail';
    if (process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS) {
      const dir = resolve(process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS); mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${name}.json`), JSON.stringify({ command: item.grader.command, expected, observed, exit: result.status, signal: result.signal, error: result.error?.message ?? null, error_kind: kind, supporting_ref: supportingRef, source_sha256: body === null ? null : hash(body), supporting_sha256: fingerprints, fixture_sha256: hash(fixture), stdout: result.stdout, stderr: result.stderr }, null, 2));
    }
    expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(observed).toBe(expected);
    if (expected === 'pass') expect(result.stderr).toContain('8 pass');
    if (name === 'parent' || name === 'unused-correct') { expect(result.stderr).toContain('4 fail'); expect(result.stderr).toContain('4 pass'); }
    if (name === 'lose-reasoning-fallback') expect(result.stderr).toContain('(fail) reasoning-only response still supplies visible content');
    if (name === 'missing-source') expect(kind).toBe('bun_unhandled_error');
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 65000);
