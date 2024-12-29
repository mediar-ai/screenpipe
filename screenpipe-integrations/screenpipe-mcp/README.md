

### 1. Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
- Windows: `notepad $env:AppData\Claude\claude_desktop_config.json`
- Mac: `code "~/Library/Application Support/Claude/claude_desktop_config.json"`

```json
{
    "mcpServers": {
        "screenpipe": {
            "command": "uv",
            "args": [
                "--directory",
                "/absolute/path/to/screenpipe-mcp",
                "run",
                "screenpipe-mcp"
            ]
        }
    }
}
```
Note: Restart Claude Desktop after making changes.


### 2. Test the Server

1. First test with MCP Inspector:
```bash
npx @modelcontextprotocol/inspector uv run screenpipe-mcp
```

2. Example queries in Claude:
- "Search for any mentions of 'rust' in my screen recordings"
- "Find audio transcriptions from the last hour"
- "Show me what was on my screen in VSCode yesterday"

### Key Features

1. **Search Parameters**:
- Full text search
- Content type filtering (OCR/Audio/UI)
- Time range filtering
- App/window filtering
- Length constraints
- Pagination

2. **Response Formatting**:
- Clearly formatted results by content type
- Relevant metadata included
- Timestamps and source information

3. **Error Handling**:
- Connection errors
- Invalid parameters
- No results cases

### Notes

1. Make sure screenpipe server is running on port 3030
2. The server assumes local connection - adjust SCREENPIPE_API if needed
3. All timestamps are handled in UTC
4. Results are formatted for readability in Claude's interface

Would you like me to explain any part in more detail or help with testing?
