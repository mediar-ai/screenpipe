import asyncio
import httpx
from datetime import datetime, timezone
import nest_asyncio
from mcp.server import NotificationOptions, Server
from mcp.server.models import InitializationOptions
import mcp.types as types
import mcp.server.stdio

# Enable nested event loops (needed for some environments)
nest_asyncio.apply()

# Initialize server
server = Server("screenpipe")

# Constants
SCREENPIPE_API = "http://localhost:3030"

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """List available search tools for screenpipe."""
    return [
        types.Tool(
            name="search-content",
            description="Search through screenpipe recorded content (OCR text, audio transcriptions, UI elements)",
            inputSchema={
                "type": "object",
                "properties": {
                    "q": {
                        "type": "string",
                        "description": "Search query",
                    },
                    "content_type": {
                        "type": "string",
                        "enum": ["all", "ocr", "audio", "ui"],
                        "description": "Type of content to search",
                        "default": "all"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results",
                        "default": 10
                    },
                    "offset": {
                        "type": "integer",
                        "description": "Number of results to skip",
                        "default": 0
                    },
                    "start_time": {
                        "type": "string",
                        "format": "date-time",
                        "description": "Start time in ISO format (e.g. 2024-01-01T00:00:00Z)"
                    },
                    "end_time": {
                        "type": "string",
                        "format": "date-time",
                        "description": "End time in ISO format (e.g. 2024-01-01T00:00:00Z)"
                    },
                    "app_name": {
                        "type": "string",
                        "description": "Filter by application name"
                    },
                    "window_name": {
                        "type": "string",
                        "description": "Filter by window name"
                    },
                    "min_length": {
                        "type": "integer",
                        "description": "Minimum content length"
                    },
                    "max_length": {
                        "type": "integer",
                        "description": "Maximum content length"
                    }
                }
            },
        ),
    ]

@server.call_tool()
async def handle_call_tool(
    name: str, 
    arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """Handle tool execution requests."""
    if not arguments:
        raise ValueError("missing arguments")

    if name == "search-content":
        async with httpx.AsyncClient() as client:
            # Build query parameters
            params = {k: v for k, v in arguments.items() if v is not None}
            
            # Make request to screenpipe API
            try:
                response = await client.get(
                    f"{SCREENPIPE_API}/search",
                    params=params,
                    timeout=30.0
                )
                response.raise_for_status()
                data = response.json()
            except Exception as e:
                return [types.TextContent(
                    type="text",
                    text=f"failed to search screenpipe: {str(e)}"
                )]

            # Format results
            results = data.get("data", [])
            if not results:
                return [types.TextContent(
                    type="text", 
                    text="no results found"
                )]

            # Format each result based on content type
            formatted_results = []
            for result in results:
                if "content" not in result:
                    continue
                
                content = result["content"]
                if content.get("type") == "OCR":
                    text = (
                        f"OCR Text: {content.get('text', 'N/A')}\n"
                        f"App: {content.get('app_name', 'N/A')}\n"
                        f"Window: {content.get('window_name', 'N/A')}\n"
                        f"Time: {content.get('timestamp', 'N/A')}\n"
                        "---\n"
                    )
                elif content.get("type") == "Audio":
                    text = (
                        f"Audio Transcription: {content.get('transcription', 'N/A')}\n"
                        f"Device: {content.get('device_name', 'N/A')}\n"
                        f"Time: {content.get('timestamp', 'N/A')}\n"
                        "---\n"
                    )
                elif content.get("type") == "UI":
                    text = (
                        f"UI Text: {content.get('text', 'N/A')}\n"
                        f"App: {content.get('app_name', 'N/A')}\n"
                        f"Window: {content.get('window_name', 'N/A')}\n"
                        f"Time: {content.get('timestamp', 'N/A')}\n"
                        "---\n"
                    )
                else:
                    continue
                
                formatted_results.append(text)

            return [types.TextContent(
                type="text",
                text="Search Results:\n\n" + "\n".join(formatted_results)
            )]
    else:
        raise ValueError(f"unknown tool: {name}")

async def run():
    """Run the MCP server."""
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="screenpipe",
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )

if __name__ == "__main__":
    asyncio.run(run())
