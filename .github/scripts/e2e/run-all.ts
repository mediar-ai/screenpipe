#!/usr/bin/env bun
/**
 * E2E test runner — runs all test suites in order
 * Cross-platform: macOS + Windows
 * Usage:
 *   bun .github/scripts/e2e/run-all.ts [--suite <name>]
 *   bun .github/scripts/e2e/run-all.ts              # runs all
 *   bun .github/scripts/e2e/run-all.ts --suite api  # runs only api suite
 */

import { join, dirname } from "path";
import {
  ARTIFACTS_DIR, HEALTH_URL, IS_WINDOWS, IS_MACOS,
  isScreenpipeRunning, getSystemInfo,
} from "./lib";
import { mkdirSync } from "fs";

const c = {
  red: (s: string) => `\x1b[0;31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[0;32m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const SUITES = [
  { name: "launch", file: "test-app-launch.ts" },
  { name: "api", file: "test-api.ts" },
  { name: "window", file: "test-main-window.ts" },
  { name: "settings", file: "test-settings.ts" },
  { name: "recording", file: "test-recording.ts" },
  { name: "permissions", file: "test-permissions.ts" },
  { name: "onboarding", file: "test-onboarding.ts" },
  { name: "chat", file: "test-chat.ts" },
];

// Parse args
let filter = "";
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--suite" && args[i + 1]) {
    filter = args[++i];
  }
}

// System info (cross-platform)
const sysInfo = getSystemInfo();

console.log(c.bold("╔══════════════════════════════════════╗"));
console.log(c.bold("║   screenpipe e2e test runner         ║"));
console.log(c.bold("╚══════════════════════════════════════╝"));
console.log("");
console.log(`artifacts: ${ARTIFACTS_DIR}`);
console.log(`time:      ${new Date().toLocaleString()}`);
console.log(`host:      ${sysInfo.hostname}`);
console.log(`os:        ${sysInfo.os}`);
console.log(`cpu:       ${sysInfo.cpu}`);
console.log(`memory:    ${sysInfo.memGB}GB`);
console.log(`platform:  ${IS_WINDOWS ? "windows" : IS_MACOS ? "macos" : "linux"}`);
console.log("");

mkdirSync(ARTIFACTS_DIR, { recursive: true });

// Preflight: check app is running
if (!isScreenpipeRunning()) {
  console.log(c.red("error: screenpipe is not running"));
  console.log("start the app first, then run tests");
  process.exit(1);
}

// Preflight: check health
try {
  await fetch(HEALTH_URL);
} catch {
  console.log(c.red("warning: health API not responding, waiting 30s..."));
  await new Promise((r) => setTimeout(r, 30_000));
  try {
    await fetch(HEALTH_URL);
  } catch {
    console.log(c.red("error: health API still not responding"));
    process.exit(1);
  }
}

const scriptDir = IS_WINDOWS
  ? dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1")
  : dirname(new URL(import.meta.url).pathname);
let passed = 0;
let failed = 0;
const failedNames: string[] = [];

for (const s of SUITES) {
  if (filter && s.name !== filter) continue;

  console.log(`\n${c.bold(`━━━ suite: ${s.name} ━━━`)}`);

  const proc = Bun.spawnSync(["bun", join(scriptDir, s.file)], {
    env: { ...process.env, ARTIFACTS_DIR },
    stdout: "inherit",
    stderr: "inherit",
  });

  if (proc.exitCode === 0) {
    passed++;
  } else {
    failed++;
    failedNames.push(s.name);
  }
}

console.log("");
console.log(c.bold("╔══════════════════════════════════════╗"));
console.log(c.bold("║   final results                      ║"));
console.log(c.bold("╚══════════════════════════════════════╝"));
console.log("");
console.log(`  suites run:    ${passed + failed}`);
console.log(`  suites passed: ${c.green(String(passed))}`);
console.log(`  suites failed: ${c.red(String(failed))}`);

if (failedNames.length > 0) {
  console.log(`\n${c.red("failed suites:")}`);
  for (const name of failedNames) {
    console.log(`  ${c.red("✗")} ${name}`);
  }
}

console.log(`\nartifacts: ${ARTIFACTS_DIR}`);
process.exit(failed > 0 ? 1 : 0);
