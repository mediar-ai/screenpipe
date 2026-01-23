#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocket } from "ws";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Helper to get current date in ISO format
function getCurrentDateInfo(): { isoDate: string; localDate: string } {
  const now = new Date();
  return {
    isoDate: now.toISOString(),
    localDate: now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  };
}

// Detect OS
const CURRENT_OS = process.platform;
const IS_MACOS = CURRENT_OS === "darwin";
const IS_WINDOWS = CURRENT_OS === "win32";
const IS_LINUX = CURRENT_OS === "linux";

// Parse command line arguments
const args = process.argv.slice(2);
let port = 3030;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
  }
}

const SCREENPIPE_API = `http://localhost:${port}`;

// Initialize server
const server = new Server(
  {
    name: "screenpipe",
    version: "0.4.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    },
  }
);

// Tool definitions
const BASE_TOOLS: Tool[] = [
  {
    name: "search-content",
    description:
      "Search screenpipe's recorded content: screen text (OCR), audio transcriptions, and UI elements. " +
      "Returns timestamped results with app context. " +
      "Call with no parameters to get recent activity. " +
      "Use the 'screenpipe://context' resource for current time when building time-based queries.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Search query. Optional - omit to return all recent content.",
        },
        content_type: {
          type: "string",
          enum: ["all", "ocr", "audio", "ui"],
          description: "Content type filter. Default: 'all'",
          default: "all",
        },
        limit: {
          type: "integer",
          description: "Max results. Default: 10",
          default: 10,
        },
        offset: {
          type: "integer",
          description: "Skip N results for pagination. Default: 0",
          default: 0,
        },
        start_time: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 UTC start time (e.g., 2024-01-15T10:00:00Z)",
        },
        end_time: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 UTC end time (e.g., 2024-01-15T18:00:00Z)",
        },
        app_name: {
          type: "string",
          description: "Filter by app (e.g., 'Google Chrome', 'Slack', 'zoom.us')",
        },
        window_name: {
          type: "string",
          description: "Filter by window title",
        },
        min_length: {
          type: "integer",
          description: "Minimum content length in characters",
        },
        max_length: {
          type: "integer",
          description: "Maximum content length in characters",
        },
        include_frames: {
          type: "boolean",
          description: "Include base64 screenshots (OCR only). Default: false",
          default: false,
        },
      },
    },
  },
  {
    name: "pixel-control",
    description:
      "Control mouse and keyboard at the pixel level. This is a cross-platform tool that works on all operating systems. " +
      "Use this to type text, press keys, move the mouse, and click buttons.",
    inputSchema: {
      type: "object",
      properties: {
        action_type: {
          type: "string",
          enum: ["WriteText", "KeyPress", "MouseMove", "MouseClick"],
          description: "Type of input action to perform",
        },
        data: {
          oneOf: [
            {
              type: "string",
              description:
                "Text to type or key to press (for WriteText and KeyPress)",
            },
            {
              type: "object",
              properties: {
                x: {
                  type: "integer",
                  description: "X coordinate for mouse movement",
                },
                y: {
                  type: "integer",
                  description: "Y coordinate for mouse movement",
                },
              },
              description: "Coordinates for MouseMove",
            },
            {
              type: "string",
              enum: ["left", "right", "middle"],
              description: "Button to click for MouseClick",
            },
          ],
          description: "Action-specific data",
        },
      },
      required: ["action_type", "data"],
    },
  },
  {
    name: "export-video",
    description:
      "Export a video of screen recordings for a specific time range. " +
      "Creates an MP4 video from the recorded frames between the start and end times.\n\n" +
      "IMPORTANT: Use ISO 8601 UTC timestamps (e.g., 2024-01-15T10:00:00Z)\n\n" +
      "EXAMPLES:\n" +
      "- Last 30 minutes: Calculate timestamps from current time\n" +
      "- Specific meeting: Use the meeting's start and end times in UTC",
    inputSchema: {
      type: "object",
      properties: {
        start_time: {
          type: "string",
          format: "date-time",
          description:
            "Start time in ISO 8601 format UTC. MUST include timezone (Z for UTC). Example: '2024-01-15T10:00:00Z'",
        },
        end_time: {
          type: "string",
          format: "date-time",
          description:
            "End time in ISO 8601 format UTC. MUST include timezone (Z for UTC). Example: '2024-01-15T10:30:00Z'",
        },
        fps: {
          type: "number",
          description:
            "Frames per second for the output video. Lower values (0.5-1.0) create smaller files, higher values (5-10) create smoother playback. Default: 1.0",
          default: 1.0,
        },
      },
      required: ["start_time", "end_time"],
    },
  },
];

const MACOS_TOOLS: Tool[] = [
  {
    name: "find-elements",
    description:
      "Find UI elements with a specific role in an application. " +
      "This tool is especially useful for identifying interactive elements. " +
      "\n\nMacOS Accessibility Roles Guide:\n" +
      "- Basic roles: 'button', 'textfield', 'checkbox', 'menu', 'list'\n" +
      "- MacOS specific roles: 'AXButton', 'AXTextField', 'AXCheckBox', 'AXMenu', etc.\n" +
      "- Text inputs can be: 'AXTextField', 'AXTextArea', 'AXComboBox', 'AXSearchField'\n" +
      "- Clickable items: 'AXButton', 'AXMenuItem', 'AXMenuBarItem', 'AXImage', 'AXStaticText'\n" +
      "- Web content may use: 'AXWebArea', 'AXLink', 'AXHeading', 'AXRadioButton'\n\n" +
      "Use MacOS Accessibility Inspector app to identify the exact roles in your target application.",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          description:
            "The name of the application (e.g., 'Chrome', 'Finder', 'Terminal')",
        },
        window: {
          type: "string",
          description: "The window name or title (optional)",
        },
        role: {
          type: "string",
          description:
            "The role to search for (e.g., 'button', 'textfield', 'AXButton', 'AXTextField'). For best results, use MacOS AX prefixed roles.",
        },
        max_results: {
          type: "integer",
          description: "Maximum number of elements to return",
          default: 10,
        },
        max_depth: {
          type: "integer",
          description: "Maximum depth of element tree to search",
        },
        use_background_apps: {
          type: "boolean",
          description: "Whether to look in background apps",
          default: true,
        },
        activate_app: {
          type: "boolean",
          description: "Whether to activate the app before searching",
          default: true,
        },
      },
      required: ["app", "role"],
    },
  },
  {
    name: "click-element",
    description:
      "Click an element in an application using its id (MacOS only)",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          description: "The name of the application",
        },
        window: {
          type: "string",
          description: "The window name (optional)",
        },
        id: {
          type: "string",
          description: "The id of the element to click",
        },
        use_background_apps: {
          type: "boolean",
          description: "Whether to look in background apps",
          default: true,
        },
        activate_app: {
          type: "boolean",
          description: "Whether to activate the app before clicking",
          default: true,
        },
      },
      required: ["app", "id"],
    },
  },
  {
    name: "fill-element",
    description: "Type text into an element in an application (MacOS only)",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          description: "The name of the application",
        },
        window: {
          type: "string",
          description: "The window name (optional)",
        },
        id: {
          type: "string",
          description: "The id of the element to fill",
        },
        text: {
          type: "string",
          description: "The text to type into the element",
        },
        use_background_apps: {
          type: "boolean",
          description: "Whether to look in background apps",
          default: true,
        },
        activate_app: {
          type: "boolean",
          description: "Whether to activate the app before typing",
          default: true,
        },
      },
      required: ["app", "id", "text"],
    },
  },
  {
    name: "scroll-element",
    description: "Scroll an element in a specific direction (MacOS only)",
    inputSchema: {
      type: "object",
      properties: {
        app: {
          type: "string",
          description: "The name of the application",
        },
        window: {
          type: "string",
          description: "The window name (optional)",
        },
        id: {
          type: "string",
          description: "The id of the element to scroll",
        },
        direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
          description: "The direction to scroll",
        },
        amount: {
          type: "integer",
          description: "The amount to scroll in pixels",
        },
        use_background_apps: {
          type: "boolean",
          description: "Whether to look in background apps",
          default: true,
        },
        activate_app: {
          type: "boolean",
          description: "Whether to activate the app before scrolling",
          default: true,
        },
      },
      required: ["app", "id", "direction", "amount"],
    },
  },
  {
    name: "open-application",
    description: "Open an application by name",
    inputSchema: {
      type: "object",
      properties: {
        app_name: {
          type: "string",
          description: "The name of the application to open",
        },
      },
      required: ["app_name"],
    },
  },
  {
    name: "open-url",
    description: "Open a URL in a browser",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to open",
        },
        browser: {
          type: "string",
          description: "The browser to use (optional)",
        },
      },
      required: ["url"],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [...BASE_TOOLS];
  if (IS_MACOS) {
    tools.push(...MACOS_TOOLS);
  }
  return { tools };
});

// MCP Resources - provide dynamic context data
const RESOURCES = [
  {
    uri: "screenpipe://context",
    name: "Current Context",
    description: "Current date/time and pre-computed timestamps for common time ranges",
    mimeType: "application/json",
  },
  {
    uri: "screenpipe://guide",
    name: "Usage Guide",
    description: "How to use screenpipe search effectively",
    mimeType: "text/markdown",
  },
];

// List resources handler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: RESOURCES };
});

// Read resource handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const dateInfo = getCurrentDateInfo();
  const now = Date.now();

  switch (uri) {
    case "screenpipe://context":
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({
              current_time: dateInfo.isoDate,
              current_date_local: dateInfo.localDate,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              timestamps: {
                now: dateInfo.isoDate,
                one_hour_ago: new Date(now - 60 * 60 * 1000).toISOString(),
                three_hours_ago: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
                today_start: `${new Date().toISOString().split("T")[0]}T00:00:00Z`,
                yesterday_start: `${new Date(now - 24 * 60 * 60 * 1000).toISOString().split("T")[0]}T00:00:00Z`,
                one_week_ago: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
              },
              common_apps: ["Google Chrome", "Safari", "Slack", "zoom.us", "Microsoft Teams", "Code", "Terminal"],
            }, null, 2),
          },
        ],
      };

    case "screenpipe://guide":
      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: `# Screenpipe Search Guide

## Quick Start
- **Get recent activity**: Call search-content with no parameters
- **Search text**: \`{"q": "search term", "content_type": "ocr"}\`
- **Time filter**: Use start_time/end_time with ISO 8601 UTC timestamps

## Content Types
- \`ocr\`: Screen text (what you see)
- \`audio\`: Transcribed speech
- \`ui\`: UI element interactions
- \`all\`: Everything (default)

## Key Parameters
| Parameter | Description | Default |
|-----------|-------------|---------|
| q | Search query | (none - returns all) |
| content_type | ocr/audio/ui/all | all |
| limit | Max results | 10 |
| start_time | ISO 8601 UTC | (no filter) |
| end_time | ISO 8601 UTC | (no filter) |
| app_name | Filter by app | (no filter) |
| include_frames | Include screenshots | false |

## Tips
1. Read screenpipe://context first to get current timestamps
2. Omit \`q\` to get all content (useful for "what was I doing?")
3. Use \`limit: 50-100\` for comprehensive searches
4. Combine app_name + time filters for focused results`,
          },
        ],
      };

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// MCP Prompts - static interaction templates
const PROMPTS = [
  {
    name: "search-recent",
    description: "Search recent screen activity",
    arguments: [
      { name: "query", description: "Optional search term", required: false },
      { name: "hours", description: "Hours to look back (default: 1)", required: false },
    ],
  },
  {
    name: "find-in-app",
    description: "Find content from a specific application",
    arguments: [
      { name: "app", description: "App name (e.g., Chrome, Slack)", required: true },
      { name: "query", description: "Optional search term", required: false },
    ],
  },
  {
    name: "meeting-notes",
    description: "Get audio transcriptions from meetings",
    arguments: [
      { name: "hours", description: "Hours to look back (default: 3)", required: false },
    ],
  },
];

// List prompts handler
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: PROMPTS };
});

// Get prompt handler
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: promptArgs } = request.params;
  const dateInfo = getCurrentDateInfo();
  const now = Date.now();

  switch (name) {
    case "search-recent": {
      const query = promptArgs?.query || "";
      const hours = parseInt(promptArgs?.hours || "1", 10);
      const startTime = new Date(now - hours * 60 * 60 * 1000).toISOString();

      return {
        description: `Search recent activity (last ${hours} hour${hours > 1 ? "s" : ""})`,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Search screenpipe for recent activity.

Current time: ${dateInfo.isoDate}

Use search-content with:
${query ? `- q: "${query}"` : "- No query filter (get all content)"}
- start_time: "${startTime}"
- limit: 50`,
            },
          },
        ],
      };
    }

    case "find-in-app": {
      const app = promptArgs?.app || "Google Chrome";
      const query = promptArgs?.query || "";

      return {
        description: `Find content from ${app}`,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Search screenpipe for content from ${app}.

Current time: ${dateInfo.isoDate}

Use search-content with:
- app_name: "${app}"
${query ? `- q: "${query}"` : "- No query filter"}
- content_type: "ocr"
- limit: 50`,
            },
          },
        ],
      };
    }

    case "meeting-notes": {
      const hours = parseInt(promptArgs?.hours || "3", 10);
      const startTime = new Date(now - hours * 60 * 60 * 1000).toISOString();

      return {
        description: `Get meeting transcriptions (last ${hours} hours)`,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Get audio transcriptions from recent meetings.

Current time: ${dateInfo.isoDate}

Use search-content with:
- content_type: "audio"
- start_time: "${startTime}"
- limit: 100

Common meeting apps: zoom.us, Microsoft Teams, Google Meet, Slack`,
            },
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// Helper function to make HTTP requests
async function fetchAPI(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${SCREENPIPE_API}${endpoint}`;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error("Missing arguments");
  }

  // Check if the tool is MacOS-only and we're not on MacOS
  const macosOnlyTools = [
    "click-element",
    "fill-element",
    "find-elements",
    "scroll-element",
    "open-application",
    "open-url",
  ];

  if (macosOnlyTools.includes(name) && !IS_MACOS) {
    return {
      content: [
        {
          type: "text",
          text: `The '${name}' tool is only available on MacOS. Current platform: ${CURRENT_OS}`,
        },
      ],
    };
  }

  try {
    switch (name) {
      case "search-content": {
        const includeFrames = args.include_frames === true;
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(args)) {
          if (value !== null && value !== undefined) {
            params.append(key, String(value));
          }
        }

        const response = await fetchAPI(`/search?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        const results = data.data || [];
        const pagination = data.pagination || {};

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No results found. Try: broader search terms, different content_type, or wider time range.",
              },
            ],
          };
        }

        // Build content array with text and optional images
        const contentItems: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [];

        const formattedResults: string[] = [];
        const images: Array<{ data: string; context: string }> = [];

        for (const result of results) {
          const content = result.content;
          if (!content) continue;

          if (result.type === "OCR") {
            formattedResults.push(
              `[OCR] ${content.app_name || "?"} | ${content.window_name || "?"}\n` +
              `${content.timestamp || ""}\n` +
              `${content.text || ""}`
            );
            if (includeFrames && content.frame) {
              images.push({
                data: content.frame,
                context: `${content.app_name} at ${content.timestamp}`,
              });
            }
          } else if (result.type === "Audio") {
            formattedResults.push(
              `[Audio] ${content.device_name || "?"}\n` +
              `${content.timestamp || ""}\n` +
              `${content.transcription || ""}`
            );
          } else if (result.type === "UI") {
            formattedResults.push(
              `[UI] ${content.app_name || "?"} | ${content.window_name || "?"}\n` +
              `${content.timestamp || ""}\n` +
              `${content.text || ""}`
            );
          }
        }

        // Header with pagination info
        const header = `Results: ${results.length}/${pagination.total || "?"}` +
          (pagination.total > results.length ? ` (use offset=${(pagination.offset || 0) + results.length} for more)` : "");

        contentItems.push({
          type: "text",
          text: header + "\n\n" + formattedResults.join("\n---\n"),
        });

        // Add images if requested
        for (const img of images) {
          contentItems.push({ type: "text", text: `\n📷 ${img.context}` });
          contentItems.push({ type: "image", data: img.data, mimeType: "image/png" });
        }

        return { content: contentItems };
      }

      case "pixel-control": {
        const action = {
          type: args.action_type,
          data: args.data,
        };

        const response = await fetchAPI("/experimental/operator/pixel", {
          method: "POST",
          body: JSON.stringify({ action }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to perform input control: ${data.error || "unknown error"}`,
              },
            ],
          };
        }

        let resultText = "Successfully performed input control action";
        if (args.action_type === "WriteText") {
          resultText = `Successfully typed text: '${args.data}'`;
        } else if (args.action_type === "KeyPress") {
          resultText = `Successfully pressed key: '${args.data}'`;
        } else if (args.action_type === "MouseMove") {
          const coords = args.data as { x: number; y: number };
          resultText = `Successfully moved mouse to coordinates: x=${coords.x}, y=${coords.y}`;
        } else if (args.action_type === "MouseClick") {
          resultText = `Successfully clicked ${args.data} mouse button`;
        }

        return {
          content: [{ type: "text", text: resultText }],
        };
      }

      case "export-video": {
        const startTime = args.start_time as string;
        const endTime = args.end_time as string;
        const fps = (args.fps as number) || 1.0;

        // Validate time inputs
        if (!startTime || !endTime) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Both start_time and end_time are required in ISO 8601 format (e.g., '2024-01-15T10:00:00Z')",
              },
            ],
          };
        }

        // Step 1: Query the search API to get frame IDs for the time range
        const searchParams = new URLSearchParams({
          content_type: "ocr",
          start_time: startTime,
          end_time: endTime,
          limit: "10000", // Get all frames in range
        });

        const searchResponse = await fetchAPI(`/search?${searchParams.toString()}`);
        if (!searchResponse.ok) {
          throw new Error(`Failed to search for frames: HTTP ${searchResponse.status}`);
        }

        const searchData = await searchResponse.json();
        const results = searchData.data || [];

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No screen recordings found between ${startTime} and ${endTime}. Make sure screenpipe was recording during this time period.`,
              },
            ],
          };
        }

        // Extract unique frame IDs from OCR results
        const frameIds: number[] = [];
        const seenIds = new Set<number>();
        for (const result of results) {
          if (result.type === "OCR" && result.content?.frame_id) {
            const frameId = result.content.frame_id;
            if (!seenIds.has(frameId)) {
              seenIds.add(frameId);
              frameIds.push(frameId);
            }
          }
        }

        if (frameIds.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Found ${results.length} results but no valid frame IDs. The recordings may be audio-only.`,
              },
            ],
          };
        }

        // Sort frame IDs
        frameIds.sort((a, b) => a - b);

        // Step 2: Connect to WebSocket and export video
        const wsUrl = `ws://localhost:${port}/frames/export?frame_ids=${frameIds.join(",")}&fps=${fps}`;

        const exportResult = await new Promise<{
          success: boolean;
          filePath?: string;
          error?: string;
          frameCount?: number;
        }>((resolve) => {
          const ws = new WebSocket(wsUrl);
          let resolved = false;

          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              ws.close();
              resolve({ success: false, error: "Export timed out after 5 minutes" });
            }
          }, 5 * 60 * 1000); // 5 minute timeout

          ws.on("error", (error) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve({ success: false, error: `WebSocket error: ${error.message}` });
            }
          });

          ws.on("close", () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve({ success: false, error: "Connection closed unexpectedly" });
            }
          });

          ws.on("message", (data) => {
            try {
              const message = JSON.parse(data.toString());

              if (message.status === "completed" && message.video_data) {
                // Save video to temp file
                const tempDir = os.tmpdir();
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const filename = `screenpipe_export_${timestamp}.mp4`;
                const filePath = path.join(tempDir, filename);

                fs.writeFileSync(filePath, Buffer.from(message.video_data));

                resolved = true;
                clearTimeout(timeout);
                ws.close();
                resolve({
                  success: true,
                  filePath,
                  frameCount: frameIds.length,
                });
              } else if (message.status === "error") {
                resolved = true;
                clearTimeout(timeout);
                ws.close();
                resolve({ success: false, error: message.error || "Export failed" });
              }
              // Ignore "extracting" and "encoding" status updates
            } catch (parseError) {
              // Ignore parse errors for progress messages
            }
          });
        });

        if (exportResult.success && exportResult.filePath) {
          return {
            content: [
              {
                type: "text",
                text: `Successfully exported video!\n\n` +
                  `File: ${exportResult.filePath}\n` +
                  `Frames: ${exportResult.frameCount}\n` +
                  `Time range: ${startTime} to ${endTime}\n` +
                  `FPS: ${fps}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `Failed to export video: ${exportResult.error}`,
              },
            ],
          };
        }
      }

      case "click-element": {
        const selector = {
          app_name: args.app,
          window_name: args.window,
          locator: `#${args.id}`,
          use_background_apps: args.use_background_apps ?? true,
          activate_app: args.activate_app ?? true,
        };

        const response = await fetchAPI("/experimental/operator/click", {
          method: "POST",
          body: JSON.stringify({ selector }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to click element: ${data.error || "unknown error"}`,
              },
            ],
          };
        }

        const result = data.result || {};
        const method = result.method || "unknown";
        const details = result.details || "click operation completed";

        return {
          content: [
            {
              type: "text",
              text: `Successfully clicked element using ${method}. ${details}`,
            },
          ],
        };
      }

      case "fill-element": {
        const selector = {
          app_name: args.app,
          window_name: args.window,
          locator: `#${args.id}`,
          use_background_apps: args.use_background_apps ?? true,
          activate_app: args.activate_app ?? true,
        };

        const response = await fetchAPI("/experimental/operator/type", {
          method: "POST",
          body: JSON.stringify({ selector, text: args.text || "" }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to fill element: ${data.error || "unknown error"}`,
              },
            ],
          };
        }

        return {
          content: [
            { type: "text", text: "Successfully filled element with text" },
          ],
        };
      }

      case "find-elements": {
        const selector = {
          app_name: args.app,
          window_name: args.window,
          locator: args.role || "",
          use_background_apps: args.use_background_apps ?? true,
          activate_app: args.activate_app ?? true,
        };

        const response = await fetchAPI("/experimental/operator", {
          method: "POST",
          body: JSON.stringify({
            selector,
            max_results: args.max_results || 10,
            max_depth: args.max_depth,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to find elements: ${data.error || "unknown error"}`,
              },
            ],
          };
        }

        const elements = data.data || [];
        if (elements.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No elements found matching role '${args.role}' in app '${args.app}'`,
              },
            ],
          };
        }

        let resultText = `Found ${elements.length} elements matching role '${args.role}' in app '${args.app}':\n\n`;
        elements.forEach((element: any, i: number) => {
          resultText +=
            `Element ${i + 1}:\n` +
            `ID: ${element.id || "N/A"}\n` +
            `Role: ${element.role || "N/A"}\n` +
            `Text: ${element.text || "N/A"}\n` +
            `Description: ${element.description || "N/A"}\n` +
            "---\n";
        });

        return {
          content: [{ type: "text", text: resultText }],
        };
      }

      case "scroll-element": {
        const selector = {
          app_name: args.app,
          window_name: args.window,
          locator: `#${args.id}`,
          use_background_apps: args.use_background_apps ?? true,
          activate_app: args.activate_app ?? true,
        };

        const response = await fetchAPI("/experimental/operator/scroll", {
          method: "POST",
          body: JSON.stringify({
            selector,
            direction: args.direction,
            amount: args.amount,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to scroll element: ${data.error || "unknown error"}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Successfully scrolled element ${args.direction} by ${args.amount} pixels`,
            },
          ],
        };
      }

      case "open-application": {
        const response = await fetchAPI(
          "/experimental/operator/open-application",
          {
            method: "POST",
            body: JSON.stringify({ app_name: args.app_name || "" }),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to open application: ${data.error || "unknown error"}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Successfully opened application '${args.app_name}'`,
            },
          ],
        };
      }

      case "open-url": {
        const response = await fetchAPI("/experimental/operator/open-url", {
          method: "POST",
          body: JSON.stringify({
            url: args.url || "",
            browser: args.browser,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to open URL: ${data.error || "unknown error"}`,
              },
            ],
          };
        }

        const browserInfo = args.browser ? ` using ${args.browser}` : "";
        return {
          content: [
            {
              type: "text",
              text: `Successfully opened URL '${args.url}'${browserInfo}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${errorMessage}`,
        },
      ],
    };
  }
});

// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Screenpipe MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
