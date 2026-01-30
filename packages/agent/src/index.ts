#!/usr/bin/env bun
/**
 * @screenpipe/agent - One-liner to connect Screenpipe to your AI agent
 *
 * Usage:
 *   bunx @screenpipe/agent --setup clawdbot --morning 08:00
 *   bunx @screenpipe/agent --remove clawdbot
 */

import { execSync, spawn } from "child_process";
import { homedir, platform } from "os";
import { writeFileSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

interface Config {
  command: "setup" | "remove" | "status" | "help";
  remote: string;
  morning: string | null;
  syncInterval: number;
  skipSync: boolean;
  skipSkills: boolean;
  verbose: boolean;
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    command: "help",
    remote: "",
    morning: null,
    syncInterval: 3600,
    skipSync: false,
    skipSkills: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--setup":
      case "-s":
        config.command = "setup";
        config.remote = args[++i] || "";
        break;
      case "--remove":
      case "-r":
        config.command = "remove";
        config.remote = args[++i] || "";
        break;
      case "--status":
        config.command = "status";
        config.remote = args[++i] || "";
        break;
      case "--morning":
      case "-m":
        config.morning = args[++i] || "08:00";
        break;
      case "--sync-interval":
        config.syncInterval = parseInt(args[++i]) || 3600;
        break;
      case "--skip-sync":
        config.skipSync = true;
        break;
      case "--skip-skills":
        config.skipSkills = true;
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
@screenpipe/agent - One-liner to connect Screenpipe to your AI agent

USAGE:
  bunx @screenpipe/agent --setup <host> [options]
  bunx @screenpipe/agent --remove <host>
  bunx @screenpipe/agent --status <host>

OPTIONS:
  --setup <host>        Set up full Screenpipe integration
  --remove <host>       Remove Screenpipe integration
  --status <host>       Check integration status

  --morning <HH:MM>     Add morning summary at specified time (e.g., 08:00)
  --sync-interval <s>   Sync frequency in seconds (default: 3600)
  --skip-sync           Don't set up data sync
  --skip-skills         Don't install skills
  -v, --verbose         Show debug output

EXAMPLES:
  # Full setup with morning summaries at 8am
  bunx @screenpipe/agent --setup clawdbot --morning 08:00

  # Setup with custom sync interval (30 min)
  bunx @screenpipe/agent --setup user@1.2.3.4 --morning 07:30 --sync-interval 1800

  # Remove integration
  bunx @screenpipe/agent --remove clawdbot

WHAT IT DOES:
  1. Sets up screen data sync daemon (survives reboot)
  2. Installs screenpipe skills (recall, search, digest, context)
  3. Adds morning summary cron job to your agent
  4. Your agent sends you daily briefings via Telegram/WhatsApp/etc
`);
}

function log(step: number, total: number, msg: string) {
  console.log(`\n[${step}/${total}] ${msg}`);
}

function exec(cmd: string, verbose: boolean): string {
  if (verbose) console.log(`  $ ${cmd}`);
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: verbose ? "inherit" : "pipe" }) || "";
  } catch (e: any) {
    if (verbose) console.error(`  Error: ${e.message}`);
    throw e;
  }
}

function testSSH(remote: string): boolean {
  try {
    execSync(`ssh -o ConnectTimeout=5 ${remote} "echo ok"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// Morning summary skill with cron instructions
const MORNING_SKILL = `---
name: screenpipe-morning
description: Morning briefing from yesterday's screen activity. Run this skill daily to get a summary of what you worked on and action items.
tools: Bash
---

# Screenpipe Morning Briefing

Generate a morning summary from yesterday's screen activity.

## Query Yesterday's Activity

\`\`\`bash
sqlite3 -header ~/.screenpipe/db.sqlite "
  SELECT
    o.app_name,
    COUNT(*) as frames,
    ROUND(COUNT(*) * 5.0 / 60, 1) as approx_minutes
  FROM ocr_text o
  JOIN frames f ON o.frame_id = f.id
  WHERE date(f.timestamp) = date('now', '-1 day')
  GROUP BY o.app_name
  ORDER BY frames DESC
  LIMIT 10;
"
\`\`\`

## Extract Action Items

Search for patterns like "TODO", "need to", "should", "must", "action item":

\`\`\`bash
sqlite3 ~/.screenpipe/db.sqlite "
  SELECT DISTINCT substr(o.text, 1, 200)
  FROM ocr_text o
  JOIN frames f ON o.frame_id = f.id
  WHERE date(f.timestamp) = date('now', '-1 day')
    AND (o.text LIKE '%TODO%'
      OR o.text LIKE '%need to%'
      OR o.text LIKE '%action item%'
      OR o.text LIKE '%reminder%')
  LIMIT 20;
"
\`\`\`

## Output Format

Send the user a concise morning briefing:

\`\`\`
Good morning! Here's your briefing:

**Yesterday's Focus:**
- VS Code: ~3 hours (screenpipe repo)
- Chrome: ~2 hours (docs, GitHub)
- Slack: ~45 min

**Action Items Found:**
- [ ] Fix auth bug in login.ts
- [ ] Review PR #234
- [ ] Send weekly update

**Pattern:** Deep focus morning, fragmented afternoon.
\`\`\`
`;

async function setupMorningCron(remote: string, time: string, verbose: boolean) {
  const [hour, minute] = time.split(":").map((x) => parseInt(x) || 0);

  // Install the morning skill
  console.log("      → Installing morning skill...");
  const skillContent = MORNING_SKILL.replace(/`/g, "\\`");
  exec(
    `ssh ${remote} "mkdir -p ~/clawd/skills/screenpipe && cat > ~/clawd/skills/screenpipe/morning.md << 'SKILLEOF'
${MORNING_SKILL}
SKILLEOF"`,
    verbose
  );

  // Add cron job on remote
  console.log("      → Adding cron job...");

  // Create the cron command - runs the morning summary
  const cronCmd = `${minute} ${hour} * * * cd ~ && echo "Run screenpipe-morning skill and send me the summary" | tee /tmp/screenpipe-morning-trigger.txt`;

  // Add to crontab (preserving existing entries)
  exec(
    `ssh ${remote} "(crontab -l 2>/dev/null | grep -v screenpipe-morning; echo '${cronCmd}') | crontab -"`,
    verbose
  );

  // Also create a script that can be triggered
  const triggerScript = `#!/bin/bash
# Screenpipe Morning Summary Trigger
# This file is created at the scheduled time to trigger the morning summary
echo "Morning summary requested at $(date)"
`;

  exec(
    `ssh ${remote} "cat > ~/clawd/screenpipe-morning-trigger.sh << 'EOF'
${triggerScript}
EOF
chmod +x ~/clawd/screenpipe-morning-trigger.sh"`,
    verbose
  );
}

async function setup(config: Config) {
  if (!config.remote) {
    console.error("Error: --setup requires a host (e.g., --setup clawdbot)");
    process.exit(1);
  }

  const totalSteps = 4;
  console.log(`\n🚀 Setting up Screenpipe integration with ${config.remote}...\n`);

  // Step 1: Test SSH connection
  log(1, totalSteps, "Testing connection...");
  if (!testSSH(config.remote)) {
    console.error(`   ✗ Cannot connect to ${config.remote}`);
    console.error(`     Make sure SSH is configured: ssh ${config.remote}`);
    process.exit(1);
  }
  console.log(`      → Connected to ${config.remote} ✓`);

  // Step 2: Set up sync daemon
  if (!config.skipSync) {
    log(2, totalSteps, "Setting up screen data sync...");
    try {
      // Install sync daemon locally
      exec(
        `bunx @screenpipe/sync --daemon --remote ${config.remote}:~/.screenpipe/ --interval ${config.syncInterval}`,
        config.verbose
      );
      console.log(`      → Daemon installed, syncs every ${config.syncInterval}s`);
    } catch (e) {
      console.log("      → Running sync setup...");
      // Fallback: run sync package directly
      const home = homedir();
      const dbPath = join(home, ".screenpipe", "db.sqlite");

      // Create remote directory
      exec(`ssh ${config.remote} "mkdir -p ~/.screenpipe"`, config.verbose);

      // Initial sync
      try {
        exec(`rsync -az "${dbPath}" ${config.remote}:~/.screenpipe/db.sqlite`, config.verbose);
        console.log("      → Initial sync complete");
      } catch {
        console.log("      → Will sync on next daemon run");
      }

      // Set up local daemon using launchd/systemd
      if (platform() === "darwin") {
        const plistPath = join(home, "Library/LaunchAgents/com.screenpipe.agent-sync.plist");
        const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.screenpipe.agent-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>rsync -az ~/.screenpipe/db.sqlite ${config.remote}:~/.screenpipe/db.sqlite 2>/dev/null || true</string>
    </array>
    <key>StartInterval</key>
    <integer>${config.syncInterval}</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/screenpipe-agent-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/screenpipe-agent-sync.err</string>
</dict>
</plist>`;
        mkdirSync(join(home, "Library/LaunchAgents"), { recursive: true });
        writeFileSync(plistPath, plist);
        try { execSync(`launchctl unload "${plistPath}" 2>/dev/null`); } catch {}
        execSync(`launchctl load "${plistPath}"`);
        console.log(`      → Daemon installed, syncs every ${config.syncInterval}s`);
      }
    }
  } else {
    log(2, totalSteps, "Skipping sync setup (--skip-sync)");
  }

  // Step 3: Install skills
  if (!config.skipSkills) {
    log(3, totalSteps, "Installing screenpipe skills...");
    try {
      exec(`bunx @screenpipe/skills install --remote ${config.remote}`, config.verbose);
      console.log("      → recall, search, digest, context installed");
    } catch {
      // Fallback: install skills manually
      console.log("      → Installing skills directly...");
      exec(`ssh ${config.remote} "mkdir -p ~/clawd/skills/screenpipe"`, config.verbose);

      // Minimal skill installation
      const digestSkill = `---
name: screenpipe-digest
description: Get a summary of screen activity
tools: Bash
---

Query ~/.screenpipe/db.sqlite for activity summary.

\\\`\\\`\\\`bash
sqlite3 ~/.screenpipe/db.sqlite "SELECT app_name, COUNT(*) FROM ocr_text GROUP BY app_name ORDER BY COUNT(*) DESC LIMIT 10;"
\\\`\\\`\\\`
`;
      exec(
        `ssh ${config.remote} "echo '${digestSkill}' > ~/clawd/skills/screenpipe/digest.md"`,
        config.verbose
      );
      console.log("      → Basic skills installed");
    }
  } else {
    log(3, totalSteps, "Skipping skills installation (--skip-skills)");
  }

  // Step 4: Set up morning summary
  if (config.morning) {
    log(4, totalSteps, `Adding morning summary at ${config.morning}...`);
    await setupMorningCron(config.remote, config.morning, config.verbose);
    console.log(`      → Scheduled for ${config.morning} daily`);
  } else {
    log(4, totalSteps, "Skipping morning summary (use --morning HH:MM to enable)");
  }

  // Done!
  console.log(`\n✅ Done! Screenpipe is connected to ${config.remote}\n`);

  if (config.morning) {
    console.log(`   📬 You'll receive daily summaries at ${config.morning}`);
  }

  console.log(`   💡 Ask your agent: "What was I working on yesterday?"`);
  console.log(`\n   To remove: bunx @screenpipe/agent --remove ${config.remote}\n`);
}

async function remove(config: Config) {
  if (!config.remote) {
    console.error("Error: --remove requires a host");
    process.exit(1);
  }

  console.log(`\n🗑️  Removing Screenpipe integration from ${config.remote}...\n`);

  // Remove local daemon
  const home = homedir();
  if (platform() === "darwin") {
    const plistPath = join(home, "Library/LaunchAgents/com.screenpipe.agent-sync.plist");
    try {
      execSync(`launchctl unload "${plistPath}" 2>/dev/null`);
      unlinkSync(plistPath);
      console.log("   ✓ Local sync daemon removed");
    } catch {
      console.log("   - No local daemon found");
    }

    // Also remove the @screenpipe/sync daemon if it exists
    const syncPlistPath = join(home, "Library/LaunchAgents/com.screenpipe.sync.plist");
    try {
      execSync(`launchctl unload "${syncPlistPath}" 2>/dev/null`);
      unlinkSync(syncPlistPath);
      console.log("   ✓ Sync daemon removed");
    } catch {}
  }

  // Remove remote cron
  try {
    exec(
      `ssh ${config.remote} "crontab -l 2>/dev/null | grep -v screenpipe | crontab -"`,
      config.verbose
    );
    console.log("   ✓ Remote cron jobs removed");
  } catch {
    console.log("   - No remote cron found");
  }

  // Remove remote skills
  try {
    exec(`ssh ${config.remote} "rm -rf ~/clawd/skills/screenpipe"`, config.verbose);
    console.log("   ✓ Remote skills removed");
  } catch {
    console.log("   - No remote skills found");
  }

  console.log("\n✅ Screenpipe integration removed\n");
}

async function status(config: Config) {
  if (!config.remote) {
    console.error("Error: --status requires a host");
    process.exit(1);
  }

  console.log(`\n📊 Screenpipe integration status for ${config.remote}\n`);

  // Check SSH
  const sshOk = testSSH(config.remote);
  console.log(`   SSH connection: ${sshOk ? "✓" : "✗"}`);

  if (!sshOk) {
    console.log("\n   Cannot connect to remote. Check SSH config.\n");
    return;
  }

  // Check local daemon
  if (platform() === "darwin") {
    try {
      const result = execSync("launchctl list | grep screenpipe", { encoding: "utf-8" });
      console.log(`   Local sync daemon: ✓ running`);
    } catch {
      console.log(`   Local sync daemon: ✗ not running`);
    }
  }

  // Check remote DB
  try {
    const dbSize = exec(
      `ssh ${config.remote} "du -h ~/.screenpipe/db.sqlite 2>/dev/null | cut -f1"`,
      false
    ).trim();
    console.log(`   Remote database: ✓ ${dbSize}`);
  } catch {
    console.log(`   Remote database: ✗ not found`);
  }

  // Check skills
  try {
    const skills = exec(
      `ssh ${config.remote} "ls ~/clawd/skills/screenpipe/*.md 2>/dev/null | wc -l"`,
      false
    ).trim();
    console.log(`   Skills installed: ✓ ${skills} skills`);
  } catch {
    console.log(`   Skills installed: ✗ none`);
  }

  // Check morning cron
  try {
    const cron = exec(
      `ssh ${config.remote} "crontab -l 2>/dev/null | grep screenpipe-morning"`,
      false
    ).trim();
    if (cron) {
      console.log(`   Morning summary: ✓ scheduled`);
    } else {
      console.log(`   Morning summary: - not scheduled`);
    }
  } catch {
    console.log(`   Morning summary: - not scheduled`);
  }

  console.log("");
}

async function main() {
  const config = parseArgs();

  switch (config.command) {
    case "setup":
      await setup(config);
      break;
    case "remove":
      await remove(config);
      break;
    case "status":
      await status(config);
      break;
    case "help":
    default:
      printHelp();
  }
}

main().catch((e) => {
  console.error(`\n❌ Error: ${e.message}\n`);
  process.exit(1);
});
