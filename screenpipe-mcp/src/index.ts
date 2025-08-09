import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const dbPath = path.join(os.homedir(), ".screenpipe", "db.sqlite");

// open database readonly – fallback to memory if missing
let db: Database.Database;
try {
  db = new Database(dbPath, { readonly: true });
} catch (e) {
  console.error(`[screenpipe-mcp] unable to open database at ${dbPath}. continuing with in-memory db.`);
  db = new Database(":memory:");
}

const server = new McpServer({
  name: "screenpipe-mcp",
  version: "0.1.0",
});

// util to safely run select queries
function safeAll(sql: string, params: any[] = []) {
  try {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  } catch (err) {
    return { error: (err as Error).message };
  }
}

server.registerTool(
  "search-content",
  {
    title: "search content",
    description:
      "search through screenpipe captured ocr, audio and ui records. returns plain text summaries.",
    inputSchema: {
      q: z.string().describe("search query to look up"),
      content_type: z.enum(["all", "ocr", "audio", "ui"]).default("all"),
      limit: z.number().int().min(1).max(500).default(25),
      offset: z.number().int().min(0).default(0),
    },
  },
  async ({ q, content_type, limit, offset }) => {
    const likeVal = `%${q}%`;
    const sections: string[] = [];

    const pushRows = (rows: any[], formatter: (r: any) => string) => {
      rows.forEach((r) => sections.push(formatter(r)));
    };

    if (content_type === "all" || content_type === "ocr") {
      const rows: any = safeAll(
        `SELECT frames.timestamp ts, frames.app_name app, frames.window_name win, ocr_text.text txt
         FROM ocr_text JOIN frames ON frames.id = ocr_text.frame_id
         WHERE ocr_text.text LIKE ? ORDER BY frames.timestamp DESC LIMIT ? OFFSET ?`,
        [likeVal, limit, offset]
      );
      if (!Array.isArray(rows)) return { content: [{ type: "text", text: `sql error: ${(rows as any).error}` }] };
      pushRows(rows, (r) => `[ocr ${r.ts}] ${r.app}/${r.win}: ${r.txt}`);
    }

    if (content_type === "all" || content_type === "audio") {
      const rows: any = safeAll(
        `SELECT timestamp ts, device_name dev, transcription txt
         FROM audio_transcriptions WHERE transcription LIKE ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [likeVal, limit, offset]
      );
      if (!Array.isArray(rows)) return { content: [{ type: "text", text: `sql error: ${(rows as any).error}` }] };
      pushRows(rows, (r) => `[audio ${r.ts}] (${r.dev}) ${r.txt}`);
    }

    if (content_type === "all" || content_type === "ui") {
      const rows: any = safeAll(
        `SELECT timestamp ts, app app, window window, text_output txt FROM ui_monitoring
         WHERE text_output LIKE ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [likeVal, limit, offset]
      );
      if (!Array.isArray(rows)) return { content: [{ type: "text", text: `sql error: ${(rows as any).error}` }] };
      pushRows(rows, (r) => `[ui ${r.ts}] ${r.app}/${r.window}: ${r.txt}`);
    }

    if (sections.length === 0) {
      sections.push("no results found");
    }

    return {
      content: [
        {
          type: "text",
          text: sections.join("\n---\n"),
        },
      ],
    };
  }
);

server.registerTool(
  "run-sql",
  {
    title: "run sql",
    description: "execute arbitrary *read-only* sql against the screenpipe sqlite database. be careful.",
    inputSchema: { sql: z.string() },
  },
  async ({ sql }) => {
    // rudimentary protection: forbid statements that mutate db
    if (/\b(insert|update|delete|drop|pragma|alter)\b/i.test(sql)) {
      return { content: [{ type: "text", text: "mutating queries are disabled" }] };
    }

    const res = safeAll(sql);
    if (!Array.isArray(res)) {
      return { content: [{ type: "text", text: `sql error: ${(res as any).error}` }] };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(res, null, 2),
        },
      ],
    };
  }
);

// add a system prompt resource to give agents solid guidance
server.registerPrompt(
  "usage-guide",
  {
    title: "usage guide",
    description: "instructions for llm agents on how to use screenpipe-mcp tools effectively",
    argsSchema: {},
  },
  () => ({
    messages: [
      {
        role: "system",
        content: {
          type: "text",
          text: `you are connected to screenpipe-mcp – the context bridge to the user's recorded screen and audio history.\n\n` +
            `tools available:\n` +
            `1. search-content – fast search across ocr (screen text), audio transcripts, and ui monitoring records. ideal first step.\n` +
            `2. run-sql – for advanced, precise queries. only select/read queries are allowed.\n\n` +
            `when you need context about what the user has done, think step-by-step whether full-text search is enough or if you need sql. always reply in lower case, keep output concise and nerdy.`,
        },
      },
    ],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("[screenpipe-mcp] fatal", e);
  process.exit(1);
});