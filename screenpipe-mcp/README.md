# screenpipe-mcp

> **black & white, pixel-nerd edition** – an mcp server that gives llms super-powers over your local screenpipe sqlite database.

[![install in cursor](https://img.shields.io/badge/install%20in%20cursor-click%20here-black?logo=cursor)](https://www.cursor.sh/#mcp?command=npx%20-y%20@mediar-ai/screenpipe-mcp)

## quick start

```bash
# run once (no install) – great for claude desktop or cursor global mcp settings
npx -y @mediar-ai/screenpipe-mcp
```

this spins up a **stdio** mcp server exposing two tools:

1. `search-content` – full-text-ish search across ocr, audio and ui tables.
2. `run-sql` – fire off arbitrary *read-only* sql statements to `~/.screenpipe/db.sqlite`.

feel free to use the built-in `usage-guide` prompt to remind yourself (and the llm) about best practices.

### claude desktop / cursor global config

add this block to your mcp servers list:

```jsonc
{
  "screenpipe": {
    "command": "npx",
    "args": ["-y", "@mediar-ai/screenpipe-mcp"]
  }
}
```

### development

```bash
cd screenpipe-mcp
pnpm i # or npm install
pnpm run dev
```

## license

mit © mediar-ai