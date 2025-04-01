import asyncio
import httpx
import nest_asyncio
from mcp.server import NotificationOptions, Server
from mcp.server.models import InitializationOptions
import mcp.types as types
import mcp.server.stdio
import argparse
import json
import platform
import sys

# Enable nested event loops (needed for some environments)
nest_asyncio.apply()

# Detect OS
CURRENT_OS = platform.system()
IS_MACOS = CURRENT_OS == "Darwin"
IS_WINDOWS = CURRENT_OS == "Windows"
IS_LINUX = CURRENT_OS == "Linux"

# Parse command line arguments
parser = argparse.ArgumentParser(description='Screenpipe MCP Server')
parser.add_argument('--port', type=int, default=3030, help='Port number for the screenpipe API (default: 3030)')
args = parser.parse_args()

# Initialize server
server = Server("screenpipe")

# Constants
SCREENPIPE_API = f"http://localhost:{args.port}"

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """List available search tools for screenpipe."""
    tools = [
        types.Tool(
            name="search-content",
            description=(
                "Search through screenpipe recorded content (OCR text, audio transcriptions, UI elements). "
                "Use this to find specific content that has appeared on your screen or been spoken. "
                "Results include timestamps, app context, and the content itself."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "q": {
                        "type": "string",
                        "description": "Search query to find in recorded content",
                    },
                    "content_type": {
                        "type": "string",
                        "enum": ["all","ocr", "audio","ui"],
                        "description": "Type of content to search: 'ocr' for screen text, 'audio' for spoken words, 'ui' for UI elements, or 'all' for everything",
                        "default": "all"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results to return",
                        "default": 10
                    },
                    "offset": {
                        "type": "integer",
                        "description": "Number of results to skip (for pagination)",
                        "default": 0
                    },
                    "start_time": {
                        "type": "string",
                        "format": "date-time",
                        "description": "Start time in ISO format UTC (e.g. 2024-01-01T00:00:00Z). Filter results from this time onward."
                    },
                    "end_time": {
                        "type": "string",
                        "format": "date-time",
                        "description": "End time in ISO format UTC (e.g. 2024-01-01T00:00:00Z). Filter results up to this time."
                    },
                    "app_name": {
                        "type": "string",
                        "description": "Filter by application name (e.g. 'Chrome', 'Safari', 'Terminal')"
                    },
                    "window_name": {
                        "type": "string",
                        "description": "Filter by window name or title"
                    },
                    "min_length": {
                        "type": "integer",
                        "description": "Minimum content length in characters"
                    },
                    "max_length": {
                        "type": "integer",
                        "description": "Maximum content length in characters"
                    }
                }
            },
        ),
        types.Tool(
            name="pixel-control",
            description=(
                "Control mouse and keyboard at the pixel level. This is a cross-platform tool that works on all operating systems. "
                "Use this to type text, press keys, move the mouse, and click buttons."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "action_type": {
                        "type": "string",
                        "enum": ["WriteText", "KeyPress", "MouseMove", "MouseClick"],
                        "description": "Type of input action to perform",
                    },
                    "data": {
                        "oneOf": [
                            {
                                "type": "string",
                                "description": "Text to type or key to press (for WriteText and KeyPress)",
                            },
                            {
                                "type": "object",
                                "properties": {
                                    "x": {"type": "integer", "description": "X coordinate for mouse movement"},
                                    "y": {"type": "integer", "description": "Y coordinate for mouse movement"},
                                },
                                "description": "Coordinates for MouseMove",
                            },
                            {
                                "type": "string",
                                "enum": ["left", "right", "middle"],
                                "description": "Button to click for MouseClick",
                            },
                        ],
                        "description": "Action-specific data",
                    },
                },
                "required": ["action_type", "data"]
            },
        ),
    ]
    
    # Add MacOS-specific tools only if running on MacOS
    if IS_MACOS:
        macos_tools = [
            types.Tool(
                name="find-elements",
                description=(
                    "Find UI elements with a specific role in an application. "
                    "This tool is especially useful for identifying interactive elements. "
                    "\n\nMacOS Accessibility Roles Guide:\n"
                    "- Basic roles: 'button', 'textfield', 'checkbox', 'menu', 'list'\n"
                    "- MacOS specific roles: 'AXButton', 'AXTextField', 'AXCheckBox', 'AXMenu', etc.\n"
                    "- Text inputs can be: 'AXTextField', 'AXTextArea', 'AXComboBox', 'AXSearchField'\n"
                    "- Clickable items: 'AXButton', 'AXMenuItem', 'AXMenuBarItem', 'AXImage', 'AXStaticText'\n"
                    "- Web content may use: 'AXWebArea', 'AXLink', 'AXHeading', 'AXRadioButton'\n\n"
                    "Use MacOS Accessibility Inspector app to identify the exact roles in your target application."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "app": {
                            "type": "string",
                            "description": "The name of the application (e.g., 'Chrome', 'Finder', 'Terminal')"
                        },
                        "window": {
                            "type": "string",
                            "description": "The window name or title (optional)",
                        },
                        "role": {
                            "type": "string",
                            "description": "The role to search for (e.g., 'button', 'textfield', 'AXButton', 'AXTextField'). For best results, use MacOS AX prefixed roles."
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of elements to return",
                            "default": 10
                        },
                        "max_depth": {
                            "type": "integer",
                            "description": "Maximum depth of element tree to search",
                        },
                        "use_background_apps": {
                            "type": "boolean",
                            "description": "Whether to look in background apps",
                            "default": True
                        },
                        "activate_app": {
                            "type": "boolean",
                            "description": "Whether to activate the app before searching",
                            "default": True
                        }
                    },
                    "required": ["app", "role"]
                }
            ),
            types.Tool(
                name="click-element",
                description="Click an element in an application using its id (MacOS only)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "app": {
                            "type": "string",
                            "description": "The name of the application"
                        },
                        "window": {
                            "type": "string",
                            "description": "The window name (optional)",
                        },
                        "id": {
                            "type": "string",
                            "description": "The id of the element to click"
                        },
                        "use_background_apps": {
                            "type": "boolean",
                            "description": "Whether to look in background apps",
                            "default": True
                        },
                        "activate_app": {
                            "type": "boolean",
                            "description": "Whether to activate the app before clicking",
                            "default": True
                        }
                    },
                    "required": ["app", "id"]
                }
            ),
            types.Tool(
                name="fill-element",
                description="Type text into an element in an application (MacOS only)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "app": {
                            "type": "string",
                            "description": "The name of the application"
                        },
                        "window": {
                            "type": "string",
                            "description": "The window name (optional)",
                        },
                        "id": {
                            "type": "string",
                            "description": "The id of the element to fill"
                        },
                        "text": {
                            "type": "string",
                            "description": "The text to type into the element"
                        },
                        "use_background_apps": {
                            "type": "boolean",
                            "description": "Whether to look in background apps",
                            "default": True
                        },
                        "activate_app": {
                            "type": "boolean",
                            "description": "Whether to activate the app before typing",
                            "default": True
                        }
                    },
                    "required": ["app", "id", "text"]
                }
            ),
            types.Tool(
                name="scroll-element",
                description="Scroll an element in a specific direction (MacOS only)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "app": {
                            "type": "string",
                            "description": "The name of the application"
                        },
                        "window": {
                            "type": "string",
                            "description": "The window name (optional)",
                        },
                        "id": {
                            "type": "string",
                            "description": "The id of the element to scroll"
                        },
                        "direction": {
                            "type": "string",
                            "enum": ["up", "down", "left", "right"],
                            "description": "The direction to scroll"
                        },
                        "amount": {
                            "type": "integer",
                            "description": "The amount to scroll in pixels"
                        },
                        "use_background_apps": {
                            "type": "boolean",
                            "description": "Whether to look in background apps",
                            "default": True
                        },
                        "activate_app": {
                            "type": "boolean",
                            "description": "Whether to activate the app before scrolling",
                            "default": True
                        }
                    },
                    "required": ["app", "id", "direction", "amount"]
                }
            ),
            types.Tool(
                name="open-application",
                description="Open an application by name",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "app_name": {
                            "type": "string",
                            "description": "The name of the application to open"
                        }
                    },
                    "required": ["app_name"]
                }
            ),
            types.Tool(
                name="open-url",
                description="Open a URL in a browser",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "The URL to open"
                        },
                        "browser": {
                            "type": "string",
                            "description": "The browser to use (optional)"
                        }
                    },
                    "required": ["url"]
                }
            ),
        ]
        tools.extend(macos_tools)
    
    return tools

@server.call_tool()
async def handle_call_tool(
    name: str, 
    arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """Handle tool execution requests."""
    if not arguments:
        raise ValueError("missing arguments")

    # Check if the tool is MacOS-only and we're not on MacOS
    macos_only_tools = ["click-element", "fill-element", "find-elements", 
                        "scroll-element", "open-application", "open-url"]
    
    if name in macos_only_tools and not IS_MACOS:
        return [types.TextContent(
            type="text",
            text=f"the '{name}' tool is only available on MacOS. current platform: {CURRENT_OS}"
        )]

    if name == "search-content":
        async with httpx.AsyncClient() as client:
            # Define the order of content types to try
            results = []
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
                try:
                    data = json.loads(response.text)
                except json.JSONDecodeError as json_error:
                    return [types.TextContent(
                        type="text",
                        text=f"failed to parse JSON response: {json_error}"
                    )]
                results.extend(data.get("data", []))

                    
            except Exception as e:
                print(f"Exception: {str(e)}")
                return [types.TextContent(
                    type="text",
                    text=f"failed to search screenpipe: {str(e)}"
                )]
                    
            # Format results
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
                if result.get("type") == "OCR":
                    text = (
                        f"OCR Text: {content.get('text', 'N/A')}\n"
                        f"App: {content.get('app_name', 'N/A')}\n"
                        f"Window: {content.get('window_name', 'N/A')}\n"
                        f"Time: {content.get('timestamp', 'N/A')}\n"
                        "---\n"
                    )
                elif result.get("type") == "Audio":
                    text = (
                        f"Audio Transcription: {content.get('transcription', 'N/A')}\n"
                        f"Device: {content.get('device_name', 'N/A')}\n"
                        f"Time: {content.get('timestamp', 'N/A')}\n"
                        "---\n"
                    )
                elif result.get("type") == "UI":
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
    
    elif name == "pixel-control":
        async with httpx.AsyncClient() as client:
            try:
                action = {
                    "type": arguments.get("action_type"),
                    "data": arguments.get("data")
                }
                
                response = await client.post(
                    f"{SCREENPIPE_API}/experimental/operator/pixel",
                    json={"action": action},
                    timeout=10.0
                )
                response.raise_for_status()
                data = response.json()
                
                if not data.get("success", False):
                    return [types.TextContent(
                        type="text",
                        text=f"failed to perform input control: {data.get('error', 'unknown error')}"
                    )]
                
                action_type = arguments.get("action_type")
                action_data = arguments.get("data")
                
                if action_type == "WriteText":
                    result_text = f"successfully typed text: '{action_data}'"
                elif action_type == "KeyPress":
                    result_text = f"successfully pressed key: '{action_data}'"
                elif action_type == "MouseMove":
                    result_text = f"successfully moved mouse to coordinates: x={action_data.get('x')}, y={action_data.get('y')}"
                elif action_type == "MouseClick":
                    result_text = f"successfully clicked {action_data} mouse button"
                else:
                    result_text = "successfully performed input control action"
                
                return [types.TextContent(
                    type="text",
                    text=result_text
                )]
                
            except Exception as e:
                return [types.TextContent(
                    type="text",
                    text=f"failed to perform input control: {str(e)}"
                )]
    
    # MacOS-only tools from here
    elif name == "click-element" and IS_MACOS:
        async with httpx.AsyncClient() as client:
            try:
                selector = {
                    "app_name": arguments.get("app"),
                    "window_name": arguments.get("window"),
                    "locator": f"#{arguments.get('id')}",
                    "use_background_apps": arguments.get("use_background_apps", True),
                    "activate_app": arguments.get("activate_app", True)
                }
                
                response = await client.post(
                    f"{SCREENPIPE_API}/experimental/operator/click",
                    json={"selector": selector},
                    timeout=30.0
                )
                response.raise_for_status()
                data = response.json()
                
                if not data.get("success", False):
                    return [types.TextContent(
                        type="text",
                        text=f"failed to click element: {data.get('error', 'unknown error')}"
                    )]
                
                result = data.get("result", {})
                method = result.get("method", "unknown")
                details = result.get("details", "click operation completed")
                
                return [types.TextContent(
                    type="text",
                    text=f"successfully clicked element using {method}. {details}"
                )]
                
            except Exception as e:
                return [types.TextContent(
                    type="text",
                    text=f"failed to click element: {str(e)}"
                )]
    
    elif name == "fill-element" and IS_MACOS:
        async with httpx.AsyncClient() as client:
            try:
                selector = {
                    "app_name": arguments.get("app"),
                    "window_name": arguments.get("window"),
                    "locator": f"#{arguments.get('id')}",
                    "use_background_apps": arguments.get("use_background_apps", True),
                    "activate_app": arguments.get("activate_app", True)
                }
                
                response = await client.post(
                    f"{SCREENPIPE_API}/experimental/operator/type",
                    json={"selector": selector, "text": arguments.get("text", "")},
                    timeout=30.0
                )
                response.raise_for_status()
                data = response.json()
                
                if not data.get("success", False):
                    return [types.TextContent(
                        type="text",
                        text=f"failed to fill element: {data.get('error', 'unknown error')}"
                    )]
                
                return [types.TextContent(
                    type="text",
                    text=f"successfully filled element with text"
                )]
                
            except Exception as e:
                return [types.TextContent(
                    type="text",
                    text=f"failed to fill element: {str(e)}"
                )]
    
    elif name == "find-elements" and IS_MACOS:
        async with httpx.AsyncClient() as client:
            try:
                selector = {
                    "app_name": arguments.get("app"),
                    "window_name": arguments.get("window"),
                    "locator": arguments.get("role", ""),
                    "use_background_apps": arguments.get("use_background_apps", True),
                    "activate_app": arguments.get("activate_app", True)
                }
                
                response = await client.post(
                    f"{SCREENPIPE_API}/experimental/operator",
                    json={
                        "selector": selector,
                        "max_results": arguments.get("max_results", 10),
                        "max_depth": arguments.get("max_depth")
                    },
                    timeout=30.0
                )
                response.raise_for_status()
                data = response.json()
                
                if not data.get("success", False):
                    return [types.TextContent(
                        type="text",
                        text=f"failed to find elements: {data.get('error', 'unknown error')}"
                    )]
                
                elements = data.get("data", [])
                
                if not elements:
                    return [types.TextContent(
                        type="text",
                        text=f"no elements found matching role '{arguments.get('role')}' in app '{arguments.get('app')}'"
                    )]
                
                result_text = f"found {len(elements)} elements matching role '{arguments.get('role')}' in app '{arguments.get('app')}':\n\n"
                
                for i, element in enumerate(elements):
                    element_info = (
                        f"Element {i+1}:\n"
                        f"ID: {element.get('id', 'N/A')}\n"
                        f"Role: {element.get('role', 'N/A')}\n"
                        f"Text: {element.get('text', 'N/A')}\n"
                        f"Description: {element.get('description', 'N/A')}\n"
                        "---\n"
                    )
                    result_text += element_info
                
                return [types.TextContent(
                    type="text",
                    text=result_text
                )]
                
            except Exception as e:
                return [types.TextContent(
                    type="text",
                    text=f"failed to find elements: {str(e)}"
                )]
    
    
    # Cross-platform tools
    elif name == "open-application":
        if IS_MACOS:
            # MacOS implementation using operator API
            async with httpx.AsyncClient() as client:
                try:
                    response = await client.post(
                        f"{SCREENPIPE_API}/experimental/operator/open-application",
                        json={"app_name": arguments.get("app_name", "")},
                        timeout=30.0
                    )
                    response.raise_for_status()
                    data = response.json()
                    
                    if not data.get("success", False):
                        return [types.TextContent(
                            type="text",
                            text=f"failed to open application: {data.get('error', 'unknown error')}"
                        )]
                    
                    return [types.TextContent(
                        type="text",
                        text=f"successfully opened application '{arguments.get('app_name')}'"
                    )]
                    
                except Exception as e:
                    return [types.TextContent(
                        type="text",
                        text=f"failed to open application: {str(e)}"
                    )]
        else:
            # Cross-platform implementation
            # For now just return a placeholder
            return [types.TextContent(
                type="text",
                text=f"attempting to open application '{arguments.get('app_name')}' on {CURRENT_OS}"
            )]
    
    elif name == "open-url":
        async with httpx.AsyncClient() as client:
            try:
                request = {
                    "url": arguments.get("url", ""),
                    "browser": arguments.get("browser")
                }
                
                response = await client.post(
                    f"{SCREENPIPE_API}/experimental/operator/open-url",
                    json=request,
                    timeout=30.0
                )
                response.raise_for_status()
                data = response.json()
                
                if not data.get("success", False):
                    return [types.TextContent(
                        type="text",
                        text=f"failed to open url: {data.get('error', 'unknown error')}"
                    )]
                
                browser_info = f" using {arguments.get('browser')}" if arguments.get("browser") else ""
                
                return [types.TextContent(
                    type="text",
                    text=f"successfully opened url '{arguments.get('url')}'{browser_info}"
                )]
                
            except Exception as e:
                return [types.TextContent(
                    type="text",
                    text=f"failed to open url: {str(e)}"
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
                server_version="0.1.1",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )

if __name__ == "__main__":
    asyncio.run(run())

