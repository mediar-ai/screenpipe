#!/usr/bin/env bun
// @bun

// src/index.ts
import { readdir, readFile, mkdir, writeFile } from "fs/promises";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
var __dirname2 = dirname(fileURLToPath(import.meta.url));
var SKILLS_DIR = join(__dirname2, "..", "skills");
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    command: "help",
    remote: null,
    outputDir: join(homedir(), "clawd", "skills", "screenpipe"),
    verbose: false
  };
  for (let i = 0;i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "install":
        config.command = "install";
        break;
      case "list":
        config.command = "list";
        break;
      case "--remote":
      case "-r":
        config.remote = args[++i];
        break;
      case "--output":
      case "-o":
        config.outputDir = args[++i];
        break;
      case "--verbose":
      case "-v":
        config.verbose = true;
        break;
      case "--help":
      case "help":
        config.command = "help";
        break;
    }
  }
  return config;
}
function printHelp() {
  console.log(`
@screenpipe/skills - Install Screenpipe skills to AI agents

USAGE:
  bunx @screenpipe/skills <command> [options]

COMMANDS:
  install             Install skills to local or remote agent
  list                List available skills

OPTIONS:
  -r, --remote <host> Install to remote server via SSH (e.g., clawdbot)
  -o, --output <dir>  Local output directory (default: ~/clawd/skills/screenpipe)
  -v, --verbose       Show debug output

EXAMPLES:
  # Install to local Clawdbot
  bunx @screenpipe/skills install

  # Install to remote server
  bunx @screenpipe/skills install --remote clawdbot

  # Install to custom directory
  bunx @screenpipe/skills install --output ~/.claude/skills/screenpipe

  # List available skills
  bunx @screenpipe/skills list

SKILLS INCLUDED:
  - recall   : Query screen history by time ("What was I doing at 3pm?")
  - search   : Full-text search memories ("Find when I saw error 404")
  - digest   : Daily activity summaries ("What did I work on today?")
  - context  : Get context for a topic ("Context for the auth refactor")
`);
}
async function listSkills() {
  console.log(`
\uD83D\uDCE6 Available Screenpipe Skills:
`);
  const files = await readdir(SKILLS_DIR);
  for (const file of files) {
    if (!file.endsWith(".md"))
      continue;
    const content = await readFile(join(SKILLS_DIR, file), "utf-8");
    const nameMatch = content.match(/name:\s*(.+)/);
    const descMatch = content.match(/description:\s*(.+)/);
    const name = nameMatch?.[1] || file.replace(".md", "");
    const desc = descMatch?.[1] || "No description";
    console.log(`  ${name}`);
    console.log(`    ${desc}
`);
  }
}
async function installSkills(config) {
  const files = await readdir(SKILLS_DIR);
  const skills = files.filter((f) => f.endsWith(".md"));
  console.log(`
\uD83D\uDCE6 Installing ${skills.length} Screenpipe skills...
`);
  if (config.remote) {
    console.log(`  Target: ${config.remote}:~/clawd/skills/screenpipe/`);
    try {
      execSync(`ssh ${config.remote} "mkdir -p ~/clawd/skills/screenpipe"`, {
        stdio: config.verbose ? "inherit" : "pipe"
      });
    } catch (e) {
      console.error(`[error] Failed to create remote directory`);
      process.exit(1);
    }
    for (const skill of skills) {
      const src = join(SKILLS_DIR, skill);
      const dest = `${config.remote}:~/clawd/skills/screenpipe/${skill}`;
      try {
        execSync(`scp "${src}" "${dest}"`, {
          stdio: config.verbose ? "inherit" : "pipe"
        });
        console.log(`  \u2713 ${skill}`);
      } catch (e) {
        console.error(`  \u2717 ${skill} - failed`);
      }
    }
    console.log(`
\u2705 Skills installed to ${config.remote}`);
    console.log(`   Your agent can now use: recall, search, digest, context`);
  } else {
    console.log(`  Target: ${config.outputDir}/`);
    await mkdir(config.outputDir, { recursive: true });
    for (const skill of skills) {
      const src = join(SKILLS_DIR, skill);
      const dest = join(config.outputDir, skill);
      const content = await readFile(src, "utf-8");
      await writeFile(dest, content);
      console.log(`  \u2713 ${skill}`);
    }
    console.log(`
\u2705 Skills installed locally`);
    console.log(`   Your agent can now use: recall, search, digest, context`);
  }
}
async function main() {
  const config = parseArgs();
  switch (config.command) {
    case "install":
      await installSkills(config);
      break;
    case "list":
      await listSkills();
      break;
    case "help":
    default:
      printHelp();
  }
}
main().catch((e) => {
  console.error(`[error] ${e.message}`);
  process.exit(1);
});
