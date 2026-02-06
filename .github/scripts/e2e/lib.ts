/**
 * E2E test library — shared helpers for all test scripts
 * Cross-platform: macOS + Windows
 * Requires: bb (bigbrother CLI) in PATH or at known locations
 */

import { $ } from "bun";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir, platform, hostname } from "os";

// ── Platform ────────────────────────────────────────────────────────────────

export const IS_WINDOWS = platform() === "win32";
export const IS_MACOS = platform() === "darwin";

// ── Config ──────────────────────────────────────────────────────────────────

export const APP_NAME = "screenpipe-app";
export const HEALTH_URL = "http://localhost:3030/health";
export const SEARCH_URL = "http://localhost:3030/search";
export const TIMEOUT_SHORT = 5_000;
export const TIMEOUT_MEDIUM = 15_000;
export const TIMEOUT_LONG = 60_000;

const defaultArtifacts = IS_WINDOWS
  ? join(tmpdir(), "screenpipe-e2e", new Date().toISOString().replace(/[:.]/g, "-"))
  : join("/tmp", "screenpipe-e2e", new Date().toISOString().replace(/[:.]/g, "-"));

export const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR ?? defaultArtifacts;

// ── Platform-specific selectors ─────────────────────────────────────────────

/**
 * Selector helpers that map to platform-appropriate accessibility roles.
 * macOS uses AX roles (AXWebArea, AXMenuBarItem, etc.)
 * Windows uses UIA ControlTypes (Document, MenuBar, MenuItem, etc.)
 */
export const sel = {
  webArea: IS_WINDOWS ? "role:Document" : "role:AXWebArea",
  window: IS_WINDOWS ? "role:Window" : "role:AXWindow",
  menuBarItem: (name: string) =>
    IS_WINDOWS
      ? `role:MenuItem AND name~:${name}`
      : `role:AXMenuBarItem AND title~:${name}`,
  menuItem: (name: string) =>
    IS_WINDOWS
      ? `role:MenuItem AND name~:${name}`
      : `role:AXMenuItem AND title:${name}`,
  staticText: (name: string) =>
    IS_WINDOWS
      ? `role:Text AND name~:${name}`
      : `role:AXStaticText AND name~:${name}`,
  textField: IS_WINDOWS ? "role:Edit" : "role:AXTextField",
  textArea: IS_WINDOWS ? "role:Edit" : "role:AXTextArea",
  button: (name: string) =>
    IS_WINDOWS
      ? `role:Button AND name~:${name}`
      : `role:AXButton AND title~:${name}`,
  titleContains: (text: string) =>
    IS_WINDOWS ? `name~:${text}` : `title~:${text}`,
  titleExact: (text: string) =>
    IS_WINDOWS ? `name:${text}` : `title:${text}`,
};

// ── Platform-specific shortcuts ─────────────────────────────────────────────

export const shortcuts = {
  /** Show/hide main window */
  showApp: IS_WINDOWS
    ? { key: "s", modifiers: "alt" }
    : { key: "s", modifiers: "cmd,ctrl" },
  /** Open search panel */
  search: IS_WINDOWS
    ? { key: "k", modifiers: "alt" }
    : { key: "k", modifiers: "cmd,ctrl" },
  /** Close window */
  closeWindow: IS_WINDOWS
    ? { key: "F4", modifiers: "alt" }
    : { key: "w", modifiers: "cmd" },
};

// ── Find bb binary ─────────────────────────────────────────────────────────

const BB_PATHS = IS_WINDOWS
  ? [
      "bb",
      "bb.exe",
      join(process.env.USERPROFILE ?? "", "Documents/bigbrother/target/release/bb.exe"),
      join(process.env.USERPROFILE ?? "", "Documents/bigbrother/target/release/bb"),
      "C:\\Program Files\\bb\\bb.exe",
    ]
  : [
      "bb",
      join(process.env.HOME ?? "", "Documents/bigbrother/target/release/bb"),
      "/usr/local/bin/bb",
    ];

let BB = "";
for (const p of BB_PATHS) {
  try {
    const res = Bun.spawnSync([p, "--version"]);
    if (res.exitCode === 0) {
      BB = p;
      break;
    }
  } catch {}
}
if (!BB) {
  const hint = IS_WINDOWS
    ? "Build it: cd %USERPROFILE%\\Documents\\bigbrother && cargo build --release -p bb"
    : "Build it: cd ~/Documents/bigbrother && cargo build --release";
  throw new Error(`bb (bigbrother) not found. ${hint}`);
}

// ── State ───────────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

let results: TestResult[] = [];
let suiteName = "";

// ── Colors ──────────────────────────────────────────────────────────────────

const c = {
  red: (s: string) => `\x1b[0;31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[0;32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[0;36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[0;33m${s}\x1b[0m`,
};

// ── Core ────────────────────────────────────────────────────────────────────

export function suite(name: string) {
  suiteName = name;
  results = [];
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  console.log(`\n${c.bold(`═══ ${name} ═══`)}`);
  console.log(`artifacts: ${ARTIFACTS_DIR}`);
  console.log("");
}

export async function test(name: string, fn: () => Promise<void> | void) {
  const idx = results.length + 1;
  process.stdout.write(`  ${c.bold(`[${idx}]`)} ${name} ... `);
  const start = performance.now();

  try {
    await fn();
    const dur = Math.round(performance.now() - start);
    console.log(`${c.green("PASS")} (${dur}ms)`);
    results.push({ name, passed: true, durationMs: dur });
  } catch (err: any) {
    const dur = Math.round(performance.now() - start);
    const msg = err?.message ?? String(err);
    console.log(`${c.red("FAIL")} (${dur}ms)`);
    results.push({ name, passed: false, durationMs: dur, error: msg });

    // Save failure details
    const safeName = name.replace(/[^a-zA-Z0-9]/g, "-");
    const logPath = join(ARTIFACTS_DIR, `fail-${idx}-${safeName}.log`);
    await Bun.write(logPath, msg);

    // Screenshot on failure
    try {
      await bb("screenshot", "--output", join(ARTIFACTS_DIR, `fail-${idx}.png`));
    } catch {}
  }
}

export function summary(): boolean {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n${c.bold("═══ results ═══")}`);
  console.log(`  total:  ${results.length}`);
  console.log(`  passed: ${c.green(String(passed))}`);
  console.log(`  failed: ${c.red(String(failed))}`);

  if (failed > 0) {
    console.log(`\n${c.red("failed tests:")}`);
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ${c.red("✗")} ${r.name}`);
      if (r.error) console.log(`    ${c.yellow(r.error.slice(0, 200))}`);
    }
  }

  console.log(`\nartifacts: ${ARTIFACTS_DIR}`);
  return failed === 0;
}

// ── bb wrappers ─────────────────────────────────────────────────────────────

/** Run bb CLI and return parsed JSON output */
export async function bb(...args: string[]): Promise<any> {
  const proc = Bun.spawnSync([BB, ...args]);
  const stdout = proc.stdout.toString().trim();
  if (proc.exitCode !== 0) {
    const stderr = proc.stderr.toString().trim();
    throw new Error(`bb ${args.join(" ")} failed (exit ${proc.exitCode}): ${stderr || stdout}`);
  }
  try {
    return JSON.parse(stdout);
  } catch {
    return stdout;
  }
}

/** Assert an element exists (with optional timeout) */
export async function assertExists(selector: string, timeoutMs = TIMEOUT_SHORT) {
  const result = await bb("wait", "--selector", selector, "--app", APP_NAME, "--timeout", String(timeoutMs));
  if (!result?.success) throw new Error(`element not found: ${selector}`);
}

/** Assert an element does NOT exist */
export async function assertNotExists(selector: string) {
  try {
    const result = await bb("find", selector, "--app", APP_NAME, "--timeout", "2000");
    const count = result?.data?.length ?? 0;
    if (count > 0) throw new Error(`element should not exist but found ${count}: ${selector}`);
  } catch (err: any) {
    // find failed = element doesn't exist = good
    if (err.message?.includes("should not exist")) throw err;
  }
}

/** Find elements matching selector */
export async function find(selector: string): Promise<any[]> {
  const result = await bb("find", selector, "--app", APP_NAME);
  return result?.data ?? [];
}

/** Click an element */
export async function click(selector: string) {
  await bb("click", selector, "--app", APP_NAME);
}

/** Type text */
export async function type(text: string) {
  await bb("type", text);
}

/** Press a key */
export async function press(key: string) {
  await bb("press", key);
}

/** Keyboard shortcut */
export async function shortcut(key: string, modifiers = IS_WINDOWS ? "alt" : "cmd") {
  await bb("shortcut", key, "--modifiers", modifiers);
}

/** Scrape all text from app */
export async function scrape(): Promise<any> {
  return bb("scrape", "--app", APP_NAME);
}

/** Take screenshot */
export async function screenshot(name = "screenshot") {
  await bb("screenshot", "--output", join(ARTIFACTS_DIR, `${name}.png`));
}

/** Get accessibility tree */
export async function tree(): Promise<any> {
  return bb("tree", "--app", APP_NAME);
}

/** Sleep for ms */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Process helpers ─────────────────────────────────────────────────────────

/** Check if screenpipe process is running (cross-platform) */
export function isScreenpipeRunning(): boolean {
  if (IS_WINDOWS) {
    const proc = Bun.spawnSync(["tasklist", "/FI", "IMAGENAME eq screenpipe*", "/NH"]);
    const out = proc.stdout.toString();
    return out.includes("screenpipe");
  } else {
    const proc = Bun.spawnSync(["pgrep", "-f", "screenpipe"]);
    return proc.exitCode === 0;
  }
}

/** Get system info (cross-platform) */
export function getSystemInfo(): { hostname: string; os: string; cpu: string; memGB: number } {
  const host = hostname();

  if (IS_WINDOWS) {
    const osInfo = Bun.spawnSync(["cmd", "/c", "ver"]).stdout.toString().trim();
    const cpuInfo = Bun.spawnSync([
      "powershell", "-NoProfile", "-Command",
      "(Get-CimInstance Win32_Processor).Name",
    ]).stdout.toString().trim();
    const memInfo = Bun.spawnSync([
      "powershell", "-NoProfile", "-Command",
      "[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)",
    ]).stdout.toString().trim();
    return { hostname: host, os: osInfo, cpu: cpuInfo, memGB: parseInt(memInfo) || 0 };
  } else {
    const osVersion = Bun.spawnSync(["sw_vers", "-productVersion"]).stdout.toString().trim();
    const chip = Bun.spawnSync(["sysctl", "-n", "machdep.cpu.brand_string"]).stdout.toString().trim();
    const memBytes = parseInt(Bun.spawnSync(["sysctl", "-n", "hw.memsize"]).stdout.toString().trim());
    return { hostname: host, os: `macOS ${osVersion}`, cpu: chip, memGB: Math.round(memBytes / 1073741824) };
  }
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

/** Fetch JSON from URL */
export async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

/** Assert health field equals expected value */
export async function assertHealthField(field: string, expected: string) {
  const health = await fetchJson(HEALTH_URL);
  const actual = health[field];
  if (String(actual) !== expected) {
    throw new Error(`health.${field}: expected "${expected}", got "${actual}"`);
  }
}

/** Assert search returns at least minCount results */
export async function assertSearchResults(contentType: string, minCount = 1) {
  const data = await fetchJson(`${SEARCH_URL}?limit=${minCount}&content_type=${contentType}`);
  const count = data?.data?.length ?? 0;
  if (count < minCount) {
    throw new Error(`search ${contentType}: expected >= ${minCount} results, got ${count}`);
  }
}

/** Wait for health API to respond */
export async function waitForHealth(timeoutS = 60) {
  const start = Date.now();
  while (Date.now() - start < timeoutS * 1000) {
    try {
      await fetchJson(HEALTH_URL);
      return;
    } catch {
      await sleep(2000);
    }
  }
  throw new Error(`health API did not respond within ${timeoutS}s`);
}

/** Get HTTP status code */
export async function httpStatus(url: string): Promise<number> {
  try {
    const res = await fetch(url);
    return res.status;
  } catch {
    return 0;
  }
}
