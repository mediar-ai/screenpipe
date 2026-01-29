# Screenpipe MCP Server

<a href="https://www.pulsemcp.com/servers/mediar-ai-screenpipe"><img src="https://www.pulsemcp.com/badge/top-pick/mediar-ai-screenpipe" width="400" alt="PulseMCP Badge"></a>

<br/>

https://github.com/user-attachments/assets/7466a689-7703-4f0b-b3e1-b1cb9ed70cff

MCP server for screenpipe - search your screen recordings, audio transcriptions, and control your computer with AI.

## Installation

### Option 1: NPX (Recommended)

The easiest way to use screenpipe-mcp is with npx. Edit your Claude Desktop config:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%AppData%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "screenpipe": {
      "command": "npx",
      "args": ["-y", "screenpipe-mcp"]
    }
  }
}
```

### Option 2: From Source

Clone and build from source:

```bash
git clone https://github.com/mediar-ai/screenpipe
cd screenpipe/screenpipe-integrations/screenpipe-mcp
npm install
npm run build
```

Then configure Claude Desktop:

```json
{
  "mcpServers": {
    "screenpipe": {
      "command": "node",
      "args": ["/absolute/path/to/screenpipe-mcp/dist/index.js"]
    }
  }
}
```

**Note:** Restart Claude Desktop after making changes.

## Testing

Test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx screenpipe-mcp
```

## Available Tools

- **search-content** - Search through recorded screen content, audio transcriptions, and UI elements
  - Full text search with content type filtering (OCR/Audio/UI)
  - Time range and app/window filtering
  - Speaker filtering (by ID or name)
  - Pagination support

- **export-video** - Export screen recordings as video files
  - Specify time range with start/end times
  - Configurable FPS for output video

## Example Queries in Claude

- "Search for any mentions of 'rust' in my screen recordings"
- "Find audio transcriptions from the last hour"
- "Show me what was on my screen in VSCode yesterday"
- "Export a video of my screen from 2-3pm today"
- "Find what John said in our meeting about the database"

## Requirements

- screenpipe must be running on localhost:3030
- Node.js >= 18.0.0

## Notes

- All timestamps are handled in UTC
- Results are formatted for readability in Claude's interface
- macOS automation features require accessibility permissions
