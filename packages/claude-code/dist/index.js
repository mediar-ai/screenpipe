#!/usr/bin/env bun
// @bun

// src/index.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";
var CLAUDE_SETTINGS_PATH = join(homedir(), ".claude.json");
function checkScreenpipe() {
  try {
    const res = execSync("curl -s http://localhost:3030/health", {
      encoding: "utf-8",
      timeout: 5000
    });
    return res.includes("ok") || res.includes("healthy");
  } catch {
    return false;
  }
}
function checkClaudeCLI() {
  try {
    execSync("which claude", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
function getSettings() {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
  } catch {
    return null;
  }
}
function saveSettings(settings) {
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}
function addMCPServer(settings) {
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }
  if (settings.mcpServers.screenpipe) {
    return false;
  }
  settings.mcpServers.screenpipe = {
    type: "stdio",
    command: "npx",
    args: ["-y", "screenpipe-mcp"],
    env: {}
  };
  return true;
}
function main() {
  console.log(`
\uD83D\uDD17 Setting up Screenpipe + Claude Code integration
`);
  console.log("[1/3] Checking Claude Code CLI...");
  if (!checkClaudeCLI()) {
    console.log("      \u2717 Claude Code CLI not found");
    console.log("");
    console.log("      Install it first:");
    console.log("      npm install -g @anthropic-ai/claude-code");
    console.log("");
    process.exit(1);
  }
  console.log("      \u2713 Claude Code CLI installed");
  console.log("[2/3] Checking Screenpipe...");
  if (!checkScreenpipe()) {
    console.log("      \u26A0 Screenpipe not running (will work once started)");
  } else {
    console.log("      \u2713 Screenpipe running");
  }
  console.log("[3/3] Adding screenpipe-mcp to Claude Code...");
  const settings = getSettings();
  if (!settings) {
    console.log("      \u2717 Claude Code settings not found at ~/.claude.json");
    console.log("      Run 'claude' once first to initialize settings");
    process.exit(1);
  }
  const added = addMCPServer(settings);
  if (!added) {
    console.log("      \u2713 Already configured!");
  } else {
    saveSettings(settings);
    console.log("      \u2713 Added screenpipe-mcp server");
  }
  console.log(`
\u2705 Done! Claude Code now has access to your screen history.
`);
  console.log("   Try asking Claude Code:");
  console.log('   \u2192 "What was I working on yesterday?"');
  console.log('   \u2192 "Find when I saw that error message"');
  console.log('   \u2192 "Search my screen for mentions of API"');
  console.log("");
  console.log(`   Note: Restart Claude Code if it's currently running.
`);
}
main();
