// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { afterAll, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { classifyGraderError } from './grader-outcome.mjs';
const repo = resolve(import.meta.dir, '../..');
const item = JSON.parse(readFileSync(join(import.meta.dir, 'cases.json'))).cases.find(c => c.id === 'app-mcp-package-http-dispatch');
const root = mkdtempSync(join(tmpdir(), 'mcp-dispatch-calibration-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
function grade(name, ref, mutate = () => {}) {
  const cwd = join(root, name); mkdirSync(cwd);
  execFileSync('tar', ['-xf', '-', '-C', cwd], { input: execFileSync('git', ['archive', ref, 'packages/screenpipe-mcp'], { cwd: repo, maxBuffer: 24 * 1024 * 1024 }) });
  const pkg = join(cwd, 'packages/screenpipe-mcp');
  symlinkSync(join(repo, 'packages/screenpipe-mcp/node_modules'), join(pkg, 'node_modules'), 'dir');
  writeFileSync(join(pkg, 'src/eval-package-dispatch.test.js'), readFileSync(join(import.meta.dir, 'graders/mcp-package-dispatch.fixture.js.txt')));
  mutate(pkg);
  const r = spawnSync(process.execPath, ['test', 'src/eval-package-dispatch.test.js'], { cwd: pkg, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024, env: { PATH: process.env.PATH, CI: 'true', TZ: 'UTC' } });
  if (process.env.MCP_DISPATCH_CALIBRATION_RESULTS) {
    mkdirSync(process.env.MCP_DISPATCH_CALIBRATION_RESULTS, { recursive: true });
    writeFileSync(join(process.env.MCP_DISPATCH_CALIBRATION_RESULTS, name + '.json'), JSON.stringify({ status: r.status, signal: r.signal, error: r.error?.message ?? null, stdout: r.stdout, stderr: r.stderr, classification: classifyGraderError(r) }, null, 2) + '\n');
  }
  return r;
}
function pass(r) { expect(r.error).toBeUndefined(); expect(r.signal).toBeNull(); expect(r.status, r.stdout + r.stderr).toBe(0); expect(r.stderr).toContain('7 pass'); }
function fail(r) { expect(r.error).toBeUndefined(); expect(r.signal).toBeNull(); expect(r.status).toBe(1); expect(classifyGraderError(r)).toBeNull(); expect(r.stderr).toContain('expect(received)'); }
function edit(pkg, file, from, to) { const p = join(pkg, file), s = readFileSync(p, 'utf8'); expect(s.split(from)).toHaveLength(2); writeFileSync(p, s.replace(from, to)); }
function manifest(pkg, mutate) { const p = join(pkg, 'package.json'), m = JSON.parse(readFileSync(p)); mutate(m); writeFileSync(p, JSON.stringify(m)); }
test('broken package responds on wrong transport; three preserved outcomes', () => { const r = grade('parent', item.base_ref); fail(r); expect(r.stderr).toContain('4 fail'); expect(r.stderr).toContain('3 pass'); });
test('historical package fix passes', () => pass(grade('reference', item.oracle_ref)));
test('current source passes', () => pass(grade('current', 'HEAD')));
test('unused correct dispatch file cannot fix package bin', () => fail(grade('unused', item.oracle_ref, p => manifest(p, m => { m.bin['screenpipe-mcp'] = 'dist/index.js'; }))));
test('equivalent renamed dispatch module passes', () => pass(grade('equivalent', item.oracle_ref, p => { renameSync(join(p, 'src/cli.ts'), join(p, 'src/entry.ts')); manifest(p, m => { m.bin['screenpipe-mcp'] = 'dist/entry.js'; }); })));
test('always HTTP fails preserved stdio', () => fail(grade('always-http', item.oracle_ref, p => edit(p, 'src/cli.ts', 'argv.includes("--http")', 'true'))));
test('similar flag must not enable HTTP', () => fail(grade('substring', item.oracle_ref, p => edit(p, 'src/cli.ts', 'argv.includes("--http")', 'argv.some(a => a.startsWith("--http"))'))));
test('direct alias must remain HTTP', () => fail(grade('alias-stdio', item.oracle_ref, p => manifest(p, m => { m.bin['screenpipe-mcp-http'] = 'dist/index.js'; }))));
test('no-op package scripts cannot hide wrong entry point', () => fail(grade('noop-broken', item.base_ref, p => manifest(p, m => { m.scripts.build = 'exit 0'; m.scripts.test = 'exit 0'; }))));
test('missing dispatch module is setup error', () => { const r = grade('missing', item.oracle_ref, p => rmSync(join(p, 'src/cli.ts'))); expect(r.status).toBe(1); expect(classifyGraderError(r)).toBe('bun_unhandled_error'); expect(r.stderr).toContain('0 pass'); });
test('compilation failure is setup error', () => { const r = grade('compile-error', item.oracle_ref, p => writeFileSync(join(p, 'src/cli.ts'), 'export const broken = ;\n')); expect(r.status).toBe(1); expect(classifyGraderError(r)).toBe('bun_unhandled_error'); expect(r.stderr).toContain('0 pass'); });
