#!/usr/bin/env bun
/**
 * @screenpipe/sync - Daily context sync from Screenpipe
 *
 * Usage:
 *   bunx @screenpipe/sync                     # Summary to stdout
 *   bunx @screenpipe/sync --output ~/notes   # Save to folder
 *   bunx @screenpipe/sync --hours 8          # Last 8 hours
 *   bunx @screenpipe/sync --git              # Auto commit & push
 *   bunx @screenpipe/sync --remote host:path # Sync to remote
 */

import Anthropic from "@anthropic-ai/sdk";

// ============================================================================
// Types
// ============================================================================

interface ScreenpipeResult {
  type: "OCR" | "Audio";
  content: {
    text: string;
    timestamp: string;
    app_name?: string;
    window_name?: string;
  };
}

interface DailySummary {
  date: string;
  apps: Record<string, number>;
  todos: string[];
  goals: string[];
  decisions: string[];
  activities: string[];
  meetings: string[];
  blockers: string[];
  insights: string[];
  rawMinutes: number;
}

interface Config {
  screenpipeUrl: string;
  outputDir: string | null;
  hours: number;
  gitPush: boolean;
  remote: string | null;
  anthropicKey: string | null;
  openaiKey: string | null;
  ollamaUrl: string | null;
  ollamaModel: string;
  format: "markdown" | "json";
  verbose: boolean;
  dbSync: boolean;
  dbPath: string;
}

// ============================================================================
// CLI Parsing
// ============================================================================

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const config: Config = {
    screenpipeUrl: process.env.SCREENPIPE_URL || "http://localhost:3030",
    outputDir: null,
    hours: 12,
    gitPush: false,
    remote: null,
    anthropicKey: process.env.ANTHROPIC_API_KEY || null,
    openaiKey: process.env.OPENAI_API_KEY || null,
    ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL || "llama3.2",
    format: "markdown",
    verbose: false,
    dbSync: false,
    dbPath: process.env.SCREENPIPE_DB || `${home}/.screenpipe/db.sqlite`,
  };

  for (let i = 0; i < args.length; i++) {
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
  bunx screenpipe-sync [options]

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

ENVIRONMENT:
  SCREENPIPE_URL        Screenpipe API URL (default: http://localhost:3030)
  SCREENPIPE_DB         Path to Screenpipe database
  ANTHROPIC_API_KEY     For AI summarization (or OPENAI_API_KEY)

EXAMPLES:
  # AI summary to stdout
  bunx screenpipe-sync

  # Save daily summaries locally
  bunx screenpipe-sync --output ~/Documents/brain/context --git

  # Sync raw database to remote (e.g., Clawdbot)
  bunx screenpipe-sync --db --remote user@clawdbot:~/.screenpipe/

  # Full sync: DB + daily summary
  bunx screenpipe-sync --db -r clawdbot:~/.screenpipe && bunx screenpipe-sync -o ~/context -g

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

// ============================================================================
// Screenpipe API
// ============================================================================

async function queryScreenpipe(
  config: Config
): Promise<ScreenpipeResult[]> {
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

// ============================================================================
// Data Processing
// ============================================================================

function processResults(results: ScreenpipeResult[]): {
  byApp: Record<string, string[]>;
  timeline: { time: string; app: string; text: string }[];
} {
  const byApp: Record<string, string[]> = {};
  const timeline: { time: string; app: string; text: string }[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (r.type !== "OCR") continue;
    const text = r.content.text?.trim();
    if (!text || text.length < 20) continue;

    // Dedupe similar content
    const hash = text.slice(0, 100);
    if (seen.has(hash)) continue;
    seen.add(hash);

    const app = r.content.app_name || "Unknown";
    byApp[app] = byApp[app] || [];
    byApp[app].push(text);

    timeline.push({
      time: r.content.timestamp,
      app,
      text: text.slice(0, 500),
    });
  }

  return { byApp, timeline };
}

// ============================================================================
// AI Extraction
// ============================================================================

const EXTRACTION_PROMPT = `You are analyzing screen capture data from a user's computer to create a structured daily summary.

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

async function extractWithAI(
  byApp: Record<string, string[]>,
  config: Config
): Promise<Partial<DailySummary>> {
  // Prepare condensed input (limit to avoid token explosion)
  const condensed = Object.entries(byApp)
    .map(([app, texts]) => {
      const sample = texts.slice(0, 20).join("\n---\n").slice(0, 3000);
      return `## ${app}\n${sample}`;
    })
    .join("\n\n")
    .slice(0, 15000);

  const prompt = EXTRACTION_PROMPT + condensed;

  // Try providers in order: Anthropic > OpenAI > Ollama > fallback
  if (config.anthropicKey) {
    if (config.verbose) console.error(`[ai] Using Claude (${condensed.length} chars)`);
    try {
      const client = new Anthropic({ apiKey: config.anthropicKey });
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error(`[error] Claude failed: ${e}`);
    }
  }

  if (config.openaiKey) {
    if (config.verbose) console.error(`[ai] Using OpenAI`);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2000,
        }),
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error(`[error] OpenAI failed: ${e}`);
    }
  }

  // Try Ollama (local)
  try {
    if (config.verbose) console.error(`[ai] Trying Ollama at ${config.ollamaUrl}`);
    const res = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ollamaModel,
        prompt: prompt,
        stream: false,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.response || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    if (config.verbose) console.error(`[warn] Ollama not available`);
  }

  // Fallback: no AI
  console.error("[warn] No AI provider available - returning basic summary");
  console.error("       Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or run Ollama locally");
  return {
    todos: [],
    goals: [],
    decisions: [],
    activities: Object.keys(byApp).map((app) => `Used ${app}`),
    meetings: [],
    blockers: [],
    insights: ["No AI provider configured - set ANTHROPIC_API_KEY or OPENAI_API_KEY"],
  };
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatMarkdown(summary: DailySummary): string {
  const { date, apps, todos, goals, decisions, activities, meetings, blockers, insights } = summary;

  const appList = Object.entries(apps)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([app, mins]) => `- **${app}**: ~${mins} min`)
    .join("\n");

  const formatList = (items: string[]) =>
    items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "_None extracted_";

  return `# Daily Context - ${date}

> Auto-generated by @screenpipe/sync
> Analyzed ${summary.rawMinutes} minutes of screen activity

## 📱 Apps Used
${appList}

## ✅ Todos Extracted
${formatList(todos)}

## 🎯 Goals Mentioned
${formatList(goals)}

## 🔀 Decisions Made
${formatList(decisions)}

## 💻 Key Activities
${formatList(activities)}

## 👥 Meetings & Conversations
${formatList(meetings)}

## 🚧 Blockers & Problems
${formatList(blockers)}

## 💡 AI Insights
${formatList(insights)}

---
_Generated at ${new Date().toISOString()}_
`;
}

// ============================================================================
// Output Handlers
// ============================================================================

async function writeOutput(content: string, config: Config, filename: string) {
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
    const { execSync } = await import("child_process");
    try {
      execSync(`cd "${dir}" && git add -A && git commit -m "sync: ${filename}" && git push`, {
        stdio: config.verbose ? "inherit" : "pipe",
      });
      console.error(`[ok] Git pushed`);
    } catch (e) {
      console.error(`[warn] Git push failed - maybe no changes?`);
    }
  }

  if (config.remote) {
    const { execSync } = await import("child_process");
    try {
      execSync(`scp "${filepath}" "${config.remote}/"`, {
        stdio: config.verbose ? "inherit" : "pipe",
      });
      console.error(`[ok] Synced to ${config.remote}`);
    } catch (e) {
      console.error(`[error] Remote sync failed: ${e}`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function syncDatabase(config: Config) {
  const fs = await import("fs/promises");
  const { execSync } = await import("child_process");

  // Check if DB exists
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

  // Copy to local output dir
  if (config.outputDir) {
    const path = await import("path");
    const destDir = path.resolve(config.outputDir);
    await fs.mkdir(destDir, { recursive: true });
    const destPath = path.join(destDir, "db.sqlite");

    console.error(`[db] Copying to ${destPath}...`);
    await fs.copyFile(config.dbPath, destPath);

    // Also copy WAL files if they exist (for consistency)
    try {
      await fs.copyFile(`${config.dbPath}-wal`, `${destPath}-wal`);
      await fs.copyFile(`${config.dbPath}-shm`, `${destPath}-shm`);
    } catch {
      // WAL files may not exist, that's ok
    }

    console.error(`[ok] Database copied to ${destPath}`);

    if (config.gitPush) {
      try {
        execSync(`cd "${destDir}" && git add -A && git commit -m "db sync $(date +%Y-%m-%d)" && git push`, {
          stdio: config.verbose ? "inherit" : "pipe",
        });
        console.error(`[ok] Git pushed`);
      } catch {
        console.error(`[warn] Git push failed - maybe no changes?`);
      }
    }
  }

  // Sync to remote
  if (config.remote) {
    console.error(`[db] Syncing to ${config.remote}...`);
    try {
      // Use rsync for efficiency (only transfers changes)
      execSync(`rsync -avz --progress "${config.dbPath}" "${config.remote}/db.sqlite"`, {
        stdio: config.verbose ? "inherit" : "pipe",
      });
      console.error(`[ok] Database synced to ${config.remote}`);
    } catch {
      // Fallback to scp if rsync not available
      try {
        execSync(`scp "${config.dbPath}" "${config.remote}/db.sqlite"`, {
          stdio: config.verbose ? "inherit" : "pipe",
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

  // DB sync mode
  if (config.dbSync) {
    await syncDatabase(config);
    return;
  }

  console.error(`[screenpipe-sync] Analyzing last ${config.hours} hours...`);

  // 1. Query Screenpipe
  const results = await queryScreenpipe(config);
  console.error(`[ok] Retrieved ${results.length} screen captures`);

  if (results.length === 0) {
    console.error("[warn] No screen data found. Is Screenpipe running?");
    process.exit(0);
  }

  // 2. Process results
  const { byApp, timeline } = processResults(results);
  console.error(`[ok] Processed ${Object.keys(byApp).length} apps`);

  // 3. Calculate app usage (rough estimate: each capture ≈ 5 seconds)
  const appMinutes: Record<string, number> = {};
  for (const app of Object.keys(byApp)) {
    appMinutes[app] = Math.round((byApp[app].length * 5) / 60);
  }

  // 4. AI extraction
  console.error(`[ai] Extracting todos, goals, decisions...`);
  const extracted = await extractWithAI(byApp, config);

  // 5. Build summary
  const summary: DailySummary = {
    date: today,
    apps: appMinutes,
    todos: extracted.todos || [],
    goals: extracted.goals || [],
    decisions: extracted.decisions || [],
    activities: extracted.activities || [],
    meetings: extracted.meetings || [],
    blockers: extracted.blockers || [],
    insights: extracted.insights || [],
    rawMinutes: Math.round((results.length * 5) / 60),
  };

  // 6. Output
  const filename =
    config.format === "json" ? `${today}.json` : `${today}.md`;

  const content =
    config.format === "json"
      ? JSON.stringify(summary, null, 2)
      : formatMarkdown(summary);

  await writeOutput(content, config, filename);
}

main().catch((e) => {
  console.error(`[fatal] ${e.message}`);
  process.exit(1);
});
