#!/usr/bin/env bun
// @bun
import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/index.ts
import { execSync } from "child_process";
function parseArgs() {
  const args = process.argv.slice(2);
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const config = {
    screenpipeUrl: process.env.SCREENPIPE_URL || "http://localhost:3030",
    outputDir: null,
    hours: 12,
    gitPush: false,
    remote: null,
    format: "markdown",
    verbose: false,
    dbSync: false,
    dbPath: process.env.SCREENPIPE_DB || `${home}/.screenpipe/db.sqlite`,
    daemon: false,
    daemonInterval: 3600,
    daemonStop: false
  };
  for (let i = 0;i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--output":
      case "-o":
        config.outputDir = args[++i];
        break;
      case "--hours":
      case "-h":
        config.hours = parseInt(args[++i]) || 12;
        break;
      case "--git":
      case "-g":
        config.gitPush = true;
        break;
      case "--remote":
      case "-r":
        config.remote = args[++i];
        break;
      case "--json":
        config.format = "json";
        break;
      case "--verbose":
      case "-v":
        config.verbose = true;
        break;
      case "--db":
      case "--db-sync":
        config.dbSync = true;
        break;
      case "--db-path":
        config.dbPath = args[++i];
        break;
      case "--daemon":
      case "-d":
        config.daemon = true;
        config.dbSync = true;
        break;
      case "--interval":
        config.daemonInterval = parseInt(args[++i]) || 3600;
        break;
      case "--stop":
        config.daemonStop = true;
        break;
      case "--help":
        printHelp();
        process.exit(0);
    }
  }
  return config;
}
function printHelp() {
  console.log(`
screenpipe-sync - Extract daily context from Screenpipe

USAGE:
  bunx @screenpipe/sync [options]

MODES:
  Summary mode (default):  AI-powered daily summary extraction
  DB sync mode (--db):     Copy raw SQLite database to remote

OPTIONS:
  -o, --output <dir>    Save summary to directory (default: stdout)
  -h, --hours <n>       Hours of history to analyze (default: 12)
  -g, --git             Auto commit and push after writing
  -r, --remote <host>   Sync to remote via SSH (user@host:path)
  --json                Output as JSON instead of markdown
  -v, --verbose         Show debug output

  --db, --db-sync       Sync raw SQLite database instead of summary
  --db-path <path>      Path to Screenpipe DB (default: ~/.screenpipe/db.sqlite)

  -d, --daemon          Install persistent background sync (survives reboot)
  --interval <secs>     Sync interval in seconds (default: 3600 = 1 hour)
  --stop                Stop and remove the daemon

ENVIRONMENT:
  SCREENPIPE_URL        Screenpipe API URL (default: http://localhost:3030)
  SCREENPIPE_DB         Path to Screenpipe database

AI SUMMARIZATION:
  Uses Claude Code CLI if available (claude --print)
  Falls back to structured extraction if no AI CLI found

EXAMPLES:
  # AI summary to stdout
  bunx @screenpipe/sync

  # Save daily summaries locally
  bunx @screenpipe/sync --output ~/Documents/brain/context --git

  # Sync raw database to remote (e.g., Clawdbot)
  bunx @screenpipe/sync --db --remote user@clawdbot:~/.screenpipe/

  # Full sync: DB + daily summary
  bunx @screenpipe/sync --db -r clawdbot:~/.screenpipe && bunx @screenpipe/sync -o ~/context -g

  # ONE-LINER: Permanent background sync (survives reboot)
  bunx @screenpipe/sync --daemon --remote user@server:~/.screenpipe/

  # Stop the daemon
  bunx @screenpipe/sync --stop

OUTPUT (summary mode):
  - Todo items extracted from screen content
  - Goals and intentions mentioned
  - Decisions made
  - Key activities by app
  - Meetings and conversations
  - Blockers and problems
  - AI-generated insights

OUTPUT (db mode):
  - Copies ~/.screenpipe/db.sqlite to remote
  - Remote can query SQLite directly for full history
`);
}
async function queryScreenpipe(config) {
  const startTime = new Date(Date.now() - config.hours * 60 * 60 * 1000);
  const url = new URL(`${config.screenpipeUrl}/search`);
  url.searchParams.set("content_type", "ocr");
  url.searchParams.set("limit", "500");
  url.searchParams.set("start_time", startTime.toISOString());
  if (config.verbose) {
    console.error(`[screenpipe] Querying: ${url}`);
  }
  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Screenpipe API error: ${res.status}`);
    }
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    console.error(`[error] Failed to connect to Screenpipe at ${config.screenpipeUrl}`);
    console.error(`        Make sure Screenpipe is running.`);
    process.exit(1);
  }
}
function processResults(results) {
  const byApp = {};
  const timeline = [];
  const seen = new Set;
  for (const r of results) {
    if (r.type !== "OCR")
      continue;
    const text = r.content.text?.trim();
    if (!text || text.length < 20)
      continue;
    const hash = text.slice(0, 100);
    if (seen.has(hash))
      continue;
    seen.add(hash);
    const app = r.content.app_name || "Unknown";
    byApp[app] = byApp[app] || [];
    byApp[app].push(text);
    timeline.push({
      time: r.content.timestamp,
      app,
      text: text.slice(0, 500)
    });
  }
  return { byApp, timeline };
}
var EXTRACTION_PROMPT = `You are analyzing screen capture data from a user's computer to create a structured daily summary.

INPUT: Raw OCR text from screen captures, organized by app.

OUTPUT: A structured extraction in this exact JSON format:
{
  "todos": ["actionable items mentioned or visible on screen"],
  "goals": ["goals, objectives, intentions mentioned"],
  "decisions": ["decisions made or discussed"],
  "activities": ["key activities/tasks worked on"],
  "meetings": ["meetings, calls, conversations"],
  "blockers": ["problems, blockers, frustrations"],
  "insights": ["2-3 AI observations about the day's work patterns"]
}

RULES:
- Extract ACTUAL content seen on screen, not generic statements
- Todos should be actionable (start with verb)
- Be specific: "Fix auth bug in login.ts" not "worked on code"
- Deduplicate similar items
- Max 10 items per category
- If no relevant content for a category, use empty array
- Insights should note patterns (context switching, focus blocks, late nights, etc.)

Analyze this screen data:
`;
function hasClaudeCli() {
  try {
    execSync("which claude", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
async function extractWithAI(byApp, config) {
  const condensed = Object.entries(byApp).map(([app, texts]) => {
    const sample = texts.slice(0, 20).join(`
---
`).slice(0, 3000);
    return `## ${app}
${sample}`;
  }).join(`

`).slice(0, 15000);
  const prompt = EXTRACTION_PROMPT + condensed;
  if (hasClaudeCli()) {
    if (config.verbose)
      console.error(`[ai] Using Claude Code CLI (${condensed.length} chars)`);
    try {
      const fs = await import("fs/promises");
      const os = await import("os");
      const path = await import("path");
      const tmpFile = path.join(os.tmpdir(), `screenpipe-prompt-${Date.now()}.txt`);
      await fs.writeFile(tmpFile, prompt);
      const result = execSync(`cat "${tmpFile}" | claude --print`, {
        encoding: "utf-8",
        maxBuffer: 10485760,
        timeout: 120000
      });
      await fs.unlink(tmpFile).catch(() => {});
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error(`[error] Claude CLI failed: ${e.message}`);
    }
  } else {
    if (config.verbose)
      console.error(`[ai] Claude CLI not found`);
  }
  console.error("[info] No AI CLI found - using structured extraction");
  console.error("       Install Claude Code CLI for AI summaries: npm install -g @anthropic-ai/claude-code");
  return {
    todos: [],
    goals: [],
    decisions: [],
    activities: Object.keys(byApp).slice(0, 10).map((app) => `Used ${app}`),
    meetings: [],
    blockers: [],
    insights: ["Structured extraction only - install Claude Code CLI for AI insights"]
  };
}
function formatMarkdown(summary) {
  const { date, apps, todos, goals, decisions, activities, meetings, blockers, insights } = summary;
  const appList = Object.entries(apps).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([app, mins]) => `- **${app}**: ~${mins} min`).join(`
`);
  const formatList = (items) => items.length > 0 ? items.map((i) => `- ${i}`).join(`
`) : "_None extracted_";
  return `# Daily Context - ${date}

> Auto-generated by @screenpipe/sync
> Analyzed ${summary.rawMinutes} minutes of screen activity

## \uD83D\uDCF1 Apps Used
${appList}

## \u2705 Todos Extracted
${formatList(todos)}

## \uD83C\uDFAF Goals Mentioned
${formatList(goals)}

## \uD83D\uDD00 Decisions Made
${formatList(decisions)}

## \uD83D\uDCBB Key Activities
${formatList(activities)}

## \uD83D\uDC65 Meetings & Conversations
${formatList(meetings)}

## \uD83D\uDEA7 Blockers & Problems
${formatList(blockers)}

## \uD83D\uDCA1 AI Insights
${formatList(insights)}

---
_Generated at ${new Date().toISOString()}_
`;
}
async function writeOutput(content, config, filename) {
  if (!config.outputDir) {
    console.log(content);
    return;
  }
  const fs = await import("fs/promises");
  const path = await import("path");
  const dir = path.resolve(config.outputDir);
  await fs.mkdir(dir, { recursive: true });
  const filepath = path.join(dir, filename);
  await fs.writeFile(filepath, content);
  console.error(`[ok] Written to ${filepath}`);
  if (config.gitPush) {
    const { execSync: execSync2 } = await import("child_process");
    try {
      execSync2(`cd "${dir}" && git add -A && git commit -m "sync: ${filename}" && git push`, {
        stdio: config.verbose ? "inherit" : "pipe"
      });
      console.error(`[ok] Git pushed`);
    } catch (e) {
      console.error(`[warn] Git push failed - maybe no changes?`);
    }
  }
  if (config.remote) {
    const { execSync: execSync2 } = await import("child_process");
    try {
      execSync2(`scp "${filepath}" "${config.remote}/"`, {
        stdio: config.verbose ? "inherit" : "pipe"
      });
      console.error(`[ok] Synced to ${config.remote}`);
    } catch (e) {
      console.error(`[error] Remote sync failed: ${e}`);
    }
  }
}
async function setupDaemon(config) {
  const fs = await import("fs/promises");
  const { execSync: execSync2 } = await import("child_process");
  const os = await import("os");
  const path = await import("path");
  const home = os.homedir();
  const platform = os.platform();
  if (!config.remote && !config.outputDir) {
    console.error(`[error] --daemon requires --remote or --output`);
    console.error(`        Example: bunx @screenpipe/sync --daemon -r user@host:~/.screenpipe/`);
    process.exit(1);
  }
  const remotePart = config.remote ? `--remote ${config.remote}` : "";
  const outputPart = config.outputDir ? `--output ${config.outputDir}` : "";
  const gitPart = config.gitPush ? "--git" : "";
  if (platform === "darwin") {
    const plistPath = path.join(home, "Library/LaunchAgents/com.screenpipe.sync.plist");
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.screenpipe.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>export PATH="$HOME/.bun/bin:/usr/local/bin:/opt/homebrew/bin:$PATH" &amp;&amp; bunx @screenpipe/sync --db ${remotePart} ${outputPart} ${gitPart}</string>
    </array>
    <key>StartInterval</key>
    <integer>${config.daemonInterval}</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/screenpipe-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/screenpipe-sync.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${home}</string>
    </dict>
</dict>
</plist>`;
    await fs.mkdir(path.dirname(plistPath), { recursive: true });
    await fs.writeFile(plistPath, plist);
    try {
      execSync2(`launchctl unload "${plistPath}" 2>/dev/null || true`);
      execSync2(`launchctl load "${plistPath}"`);
    } catch (e) {
      console.error(`[error] Failed to load LaunchAgent: ${e}`);
      process.exit(1);
    }
    console.log(`[ok] Daemon installed (macOS LaunchAgent)`);
    console.log(`     Syncs every ${config.daemonInterval}s to: ${config.remote || config.outputDir}`);
    console.log(`     Logs: /tmp/screenpipe-sync.log`);
    console.log(`     Stop: bunx @screenpipe/sync --stop`);
  } else if (platform === "linux") {
    const serviceDir = path.join(home, ".config/systemd/user");
    const servicePath = path.join(serviceDir, "screenpipe-sync.service");
    const timerPath = path.join(serviceDir, "screenpipe-sync.timer");
    const service = `[Unit]
Description=Screenpipe Sync

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'export PATH="$HOME/.bun/bin:$PATH" && bunx @screenpipe/sync --db ${remotePart} ${outputPart} ${gitPart}'
Environment=HOME=${home}

[Install]
WantedBy=default.target`;
    const timer = `[Unit]
Description=Screenpipe Sync Timer

[Timer]
OnBootSec=60
OnUnitActiveSec=${config.daemonInterval}s
Persistent=true

[Install]
WantedBy=timers.target`;
    await fs.mkdir(serviceDir, { recursive: true });
    await fs.writeFile(servicePath, service);
    await fs.writeFile(timerPath, timer);
    try {
      execSync2("systemctl --user daemon-reload");
      execSync2("systemctl --user enable --now screenpipe-sync.timer");
    } catch (e) {
      console.error(`[error] Failed to enable systemd timer: ${e}`);
      process.exit(1);
    }
    console.log(`[ok] Daemon installed (systemd user timer)`);
    console.log(`     Syncs every ${config.daemonInterval}s to: ${config.remote || config.outputDir}`);
    console.log(`     Status: systemctl --user status screenpipe-sync.timer`);
    console.log(`     Stop: bunx @screenpipe/sync --stop`);
  } else {
    console.error(`[error] Daemon not supported on ${platform}`);
    console.error(`        Use cron instead: */60 * * * * bunx @screenpipe/sync --db ${remotePart}`);
    process.exit(1);
  }
}
async function stopDaemon() {
  const { execSync: execSync2 } = await import("child_process");
  const os = await import("os");
  const fs = await import("fs/promises");
  const path = await import("path");
  const home = os.homedir();
  const platform = os.platform();
  if (platform === "darwin") {
    const plistPath = path.join(home, "Library/LaunchAgents/com.screenpipe.sync.plist");
    try {
      execSync2(`launchctl unload "${plistPath}" 2>/dev/null`);
      await fs.unlink(plistPath);
      console.log(`[ok] Daemon stopped and removed`);
    } catch {
      console.log(`[ok] Daemon was not running`);
    }
  } else if (platform === "linux") {
    try {
      execSync2("systemctl --user disable --now screenpipe-sync.timer 2>/dev/null");
      console.log(`[ok] Daemon stopped and disabled`);
    } catch {
      console.log(`[ok] Daemon was not running`);
    }
  }
}
async function syncDatabase(config) {
  const fs = await import("fs/promises");
  const { execSync: execSync2 } = await import("child_process");
  try {
    await fs.access(config.dbPath);
  } catch {
    console.error(`[error] Database not found at ${config.dbPath}`);
    console.error(`        Set --db-path or SCREENPIPE_DB environment variable`);
    process.exit(1);
  }
  const stats = await fs.stat(config.dbPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
  console.error(`[db] Found database: ${config.dbPath} (${sizeMB} MB)`);
  if (!config.remote && !config.outputDir) {
    console.error(`[error] --db requires --remote or --output to specify destination`);
    process.exit(1);
  }
  if (config.outputDir) {
    const path = await import("path");
    const destDir = path.resolve(config.outputDir);
    await fs.mkdir(destDir, { recursive: true });
    const destPath = path.join(destDir, "db.sqlite");
    console.error(`[db] Copying to ${destPath}...`);
    await fs.copyFile(config.dbPath, destPath);
    try {
      await fs.copyFile(`${config.dbPath}-wal`, `${destPath}-wal`);
      await fs.copyFile(`${config.dbPath}-shm`, `${destPath}-shm`);
    } catch {}
    console.error(`[ok] Database copied to ${destPath}`);
    if (config.gitPush) {
      try {
        execSync2(`cd "${destDir}" && git add -A && git commit -m "db sync $(date +%Y-%m-%d)" && git push`, {
          stdio: config.verbose ? "inherit" : "pipe"
        });
        console.error(`[ok] Git pushed`);
      } catch {
        console.error(`[warn] Git push failed - maybe no changes?`);
      }
    }
  }
  if (config.remote) {
    console.error(`[db] Syncing to ${config.remote}...`);
    try {
      execSync2(`rsync -avz --progress "${config.dbPath}" "${config.remote}/db.sqlite"`, {
        stdio: config.verbose ? "inherit" : "pipe"
      });
      console.error(`[ok] Database synced to ${config.remote}`);
    } catch {
      try {
        execSync2(`scp "${config.dbPath}" "${config.remote}/db.sqlite"`, {
          stdio: config.verbose ? "inherit" : "pipe"
        });
        console.error(`[ok] Database copied to ${config.remote}`);
      } catch (e) {
        console.error(`[error] Failed to sync database: ${e}`);
        process.exit(1);
      }
    }
  }
  console.error(`[done] Database sync complete`);
}
async function main() {
  const config = parseArgs();
  const today = new Date().toISOString().split("T")[0];
  if (config.daemonStop) {
    await stopDaemon();
    return;
  }
  if (config.daemon) {
    await setupDaemon(config);
    return;
  }
  if (config.dbSync) {
    await syncDatabase(config);
    return;
  }
  console.error(`[screenpipe-sync] Analyzing last ${config.hours} hours...`);
  const results = await queryScreenpipe(config);
  console.error(`[ok] Retrieved ${results.length} screen captures`);
  if (results.length === 0) {
    console.error("[warn] No screen data found. Is Screenpipe running?");
    process.exit(0);
  }
  const { byApp, timeline } = processResults(results);
  console.error(`[ok] Processed ${Object.keys(byApp).length} apps`);
  const appMinutes = {};
  for (const app of Object.keys(byApp)) {
    appMinutes[app] = Math.round(byApp[app].length * 5 / 60);
  }
  console.error(`[ai] Extracting todos, goals, decisions...`);
  const extracted = await extractWithAI(byApp, config);
  const summary = {
    date: today,
    apps: appMinutes,
    todos: extracted.todos || [],
    goals: extracted.goals || [],
    decisions: extracted.decisions || [],
    activities: extracted.activities || [],
    meetings: extracted.meetings || [],
    blockers: extracted.blockers || [],
    insights: extracted.insights || [],
    rawMinutes: Math.round(results.length * 5 / 60)
  };
  const filename = config.format === "json" ? `${today}.json` : `${today}.md`;
  const content = config.format === "json" ? JSON.stringify(summary, null, 2) : formatMarkdown(summary);
  await writeOutput(content, config, filename);
}
main().catch((e) => {
  console.error(`[fatal] ${e.message}`);
  process.exit(1);
});
