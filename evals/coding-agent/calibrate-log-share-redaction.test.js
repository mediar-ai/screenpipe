// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { afterAll, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { classifyGraderError } from "./grader-outcome.mjs";
const repo = resolve(import.meta.dir, "../.."), app = "apps/screenpipe-app-tauri";
const item = JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8")).cases.find(c => c.id === "app-log-share-redaction-false-positive");
const component = `${app}/components/share-logs-button.tsx`, helper = `${app}/lib/utils/redact-pii.ts`;
const deps = resolve(process.env.SCREENPIPE_EVAL_DESKTOP_DEPENDENCIES || join(repo, app, "node_modules"));
const receipts = process.env.SCREENPIPE_EVAL_CALIBRATION_RECEIPTS;
const root = mkdtempSync(join(tmpdir(), "log-share-calibration-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
function git(...args) { return execFileSync("git", args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 }); }
function edit(cwd, path, transform) {
 const file = join(cwd, path), before = readFileSync(file, "utf8"), after = transform(before);
 expect(after).not.toBe(before); writeFileSync(file, after);
}
function removeSection(source, start, end) {
 const a = source.indexOf(start), b = source.indexOf(end, a);
 expect(a).toBeGreaterThan(-1); expect(b).toBeGreaterThan(a);
 return source.slice(0, a) + source.slice(b);
}
function grade(name, ref = item.oracle_ref, mutate = () => {}) {
 const cwd = join(root, name); mkdirSync(cwd);
 const paths = ["components", "lib", "types", "vitest.config.ts", "vitest.setup.ts", "tsconfig.json", "package.json"].map(p => `${app}/${p}`).filter(p => git("ls-tree", ref, "--", p).toString().trim());
 execFileSync("tar", ["-x", "-C", cwd], { input: git("archive", ref, "--", ...paths) });
 for (const f of item.grader.fixtures) { const dest = join(cwd, f.destination_path); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, readFileSync(join(import.meta.dir, f.local_path))); }
 expect(existsSync(join(deps, "vitest/package.json"))).toBe(true);
 symlinkSync(deps, join(cwd, app, "node_modules"), "dir"); mutate(cwd);
 const result = spawnSync("/bin/bash", ["-c", item.grader.command], { cwd, encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024, env: { PATH: process.env.PATH, HOME: cwd, CI: "true", TZ: "UTC", NO_COLOR: "1" } });
 const kind = classifyGraderError(result);
 if (receipts) { mkdirSync(receipts, { recursive: true }); for (const channel of ["stdout", "stderr"]) writeFileSync(join(receipts, `${name}.${channel}`), result[channel] || ""); writeFileSync(join(receipts, `${name}.json`), JSON.stringify({ ref, command: item.grader.command, exit_code: result.status, signal: result.signal, error: result.error?.message, grader_error_kind: kind }, null, 2)); }
 expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); return { ...result, kind };
}
function passes(r) { expect(r.status).toBe(0); expect(r.kind).toBeNull(); expect(r.stdout).toContain("8 passed"); }
function fails(r) { expect(r.status).toBe(1); expect(r.kind).toBeNull(); expect(r.stderr).toMatch(/AssertionError|Error: expect\(/); }
test("historical parent fails intended outcomes", () => { const r = grade("parent", item.base_ref); fails(r); expect(r.stdout).toContain("2 failed | 6 passed"); expect(r.stdout).toContain("bounds_flat=47692 111658 44767 39496"); }, 60000);
test("historical reference preserves all eight outcomes", () => passes(grade("reference")), 60000);
test("equivalent replacement labels pass", () => passes(grade("labels", item.oracle_ref, cwd => edit(cwd, helper, s => s.replace(/\[(EMAIL|PHONE|SSN|CARD|REDACTED|IP|USER)\]/g, "[FILTERED]")))), 60000);
test("equivalent inline redactor passes", () => passes(grade("inline", item.oracle_ref, cwd => {
 const implementation = git("show", `${item.oracle_ref}:${helper}`).toString().replace("export function", "function");
 edit(cwd, component, s => s.replace('import { redactPii } from "@/lib/utils/redact-pii";', implementation));
})), 60000);
test("unused correct source cannot mask the broken caller", () => fails(grade("unused", item.base_ref, cwd => { writeFileSync(join(cwd, app, "unused-redactor.ts"), git("show", `${item.oracle_ref}:${helper}`)); })), 60000);
test("API credential leaks are rejected", () => fails(grade("api", item.oracle_ref, cwd => edit(cwd, helper, s => removeSection(s, "    // API keys", "    // bearer tokens")))), 60000);
test("non-local IP leaks are rejected", () => fails(grade("ip", item.oracle_ref, cwd => edit(cwd, helper, s => removeSection(s, "    // IP addresses", "    // home directory")))), 60000);
test("home-directory username leaks are rejected", () => fails(grade("home", item.oracle_ref, cwd => edit(cwd, helper, s => s.slice(0, s.indexOf("    // home directory")) + ";\n}\n"))), 60000);
test("corrupting preserved numeric telemetry is rejected", () => fails(grade("numbers", item.oracle_ref, cwd => edit(cwd, helper, s => s.replace("return text", 'return text.replace(/605818409/g, "[FILTERED]")')))), 60000);
test("omitting chat context is rejected", () => fails(grade("omission", item.oracle_ref, cwd => edit(cwd, component, s => s.replace("const conversations = await loadAllConversations();", "const conversations = [];")))), 60000);
test("disabling all redaction is rejected", () => fails(grade("disabled", item.oracle_ref, cwd => edit(cwd, helper, s => s.replace("return text", "return text; return text")))), 60000);
test("missing caller remains an infrastructure error", () => { const r = grade("missing", item.oracle_ref, cwd => rmSync(join(cwd, component))); expect(r.status).toBe(1); expect(r.kind).toBe("vitest_collection_error"); expect(r.stderr).not.toMatch(/^AssertionError/m); }, 60000);
