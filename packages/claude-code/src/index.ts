#!/usr/bin/env bun
/**
 * @screenpipe/claude-code - One command to give Claude Code access to your screen history
 *
 * Usage:
 *   bunx @screenpipe/claude-code
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";

const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude.json");

function checkScreenpipe(): boolean {
  try {
    const res = execSync("curl -s http://localhost:3030/health", {
      encoding: "utf-8",
      timeout: 5000,
    });
    return res.includes("ok") || res.includes("healthy");
  } catch {
    return false;
  }
}

function checkClaudeCLI(): boolean {
  try {
    execSync("which claude", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getSettings(): any {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function saveSettings(settings: any): void {
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function addMCPServer(settings: any): boolean {
  // Add to global mcpServers
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  if (settings.mcpServers.screenpipe) {
    return false; // Already configured
  }

  settings.mcpServers.screenpipe = {
    type: "stdio",
    command: "npx",
    args: ["-y", "screenpipe-mcp"],
    env: {},
  };

  return true;
}

function main() {
  console.log("\n🔗 Setting up Screenpipe + Claude Code integration\n");

  // Step 1: Check Claude CLI
  console.log("[1/3] Checking Claude Code CLI...");
  if (!checkClaudeCLI()) {
    console.log("      ✗ Claude Code CLI not found");
    console.log("");
    console.log("      Install it first:");
    console.log("      npm install -g @anthropic-ai/claude-code");
    console.log("");
    process.exit(1);
  }
  console.log("      ✓ Claude Code CLI installed");

  // Step 2: Check Screenpipe
  console.log("[2/3] Checking Screenpipe...");
  if (!checkScreenpipe()) {
    console.log("      ⚠ Screenpipe not running (will work once started)");
  } else {
    console.log("      ✓ Screenpipe running");
  }

  // Step 3: Add MCP config
  console.log("[3/3] Adding screenpipe-mcp to Claude Code...");
  const settings = getSettings();
  if (!settings) {
    console.log("      ✗ Claude Code settings not found at ~/.claude.json");
    console.log("      Run 'claude' once first to initialize settings");
    process.exit(1);
  }

  const added = addMCPServer(settings);
  if (!added) {
    console.log("      ✓ Already configured!");
  } else {
    saveSettings(settings);
    console.log("      ✓ Added screenpipe-mcp server");
  }

  // Done
  console.log("\n✅ Done! Claude Code now has access to your screen history.\n");
  console.log("   Try asking Claude Code:");
  console.log('   → "What was I working on yesterday?"');
  console.log('   → "Find when I saw that error message"');
  console.log('   → "Search my screen for mentions of API"');
  console.log("");
  console.log("   Note: Restart Claude Code if it's currently running.\n");
}

main();
