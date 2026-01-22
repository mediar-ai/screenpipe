#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

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
    version: "0.3.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const BASE_TOOLS: Tool[] = [
  {
    name: "search-content",
    description:
      "Search through screenpipe recorded content (OCR text, audio transcriptions, UI elements). " +
      "Use this to find specific content that has appeared on your screen or been spoken. " +
      "Results include timestamps, app context, and the content itself. " +
      "Set include_frames=true to get screenshot images for visual analysis (OCR results only).",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Search query to find in recorded content",
        },
        content_type: {
          type: "string",
          enum: ["all", "ocr", "audio", "ui"],
          description:
            "Type of content to search: 'ocr' for screen text, 'audio' for spoken words, 'ui' for UI elements, or 'all' for everything",
          default: "all",
        },
        limit: {
          type: "integer",
          description: "Maximum number of results to return",
          default: 10,
        },
        offset: {
          type: "integer",
          description: "Number of results to skip (for pagination)",
          default: 0,
        },
        start_time: {
          type: "string",
          format: "date-time",
          description:
            "Start time in ISO format UTC (e.g. 2024-01-01T00:00:00Z). Filter results from this time onward.",
        },
        end_time: {
          type: "string",
          format: "date-time",
          description:
            "End time in ISO format UTC (e.g. 2024-01-01T00:00:00Z). Filter results up to this time.",
        },
        app_name: {
          type: "string",
          description:
            "Filter by application name (e.g. 'Chrome', 'Safari', 'Terminal')",
        },
        window_name: {
          type: "string",
          description: "Filter by window name or title",
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
          description:
            "Include screenshot images in results for visual analysis. Only applies to OCR results. " +
            "When true, returns base64-encoded images that can be analyzed with vision capabilities. " +
            "Note: Images are limited to ~1MB each. Default: false",
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

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: "No results found" }],
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
            const textResult =
              `OCR Text: ${content.text || "N/A"}\n` +
              `App: ${content.app_name || "N/A"}\n` +
              `Window: ${content.window_name || "N/A"}\n` +
              `Time: ${content.timestamp || "N/A"}\n` +
              `Frame ID: ${content.frame_id || "N/A"}\n` +
              "---";
            formattedResults.push(textResult);

            // Collect frame if available and requested
            if (includeFrames && content.frame) {
              images.push({
                data: content.frame,
                context: `Screenshot from ${content.app_name || "unknown"} - ${content.window_name || "unknown"} at ${content.timestamp || "unknown"}`,
              });
            }
          } else if (result.type === "Audio") {
            formattedResults.push(
              `Audio Transcription: ${content.transcription || "N/A"}\n` +
                `Device: ${content.device_name || "N/A"}\n` +
                `Time: ${content.timestamp || "N/A"}\n` +
                "---"
            );
          } else if (result.type === "UI") {
            formattedResults.push(
              `UI Text: ${content.text || "N/A"}\n` +
                `App: ${content.app_name || "N/A"}\n` +
                `Window: ${content.window_name || "N/A"}\n` +
                `Time: ${content.timestamp || "N/A"}\n` +
                "---"
            );
          }
        }

        // Add text results
        contentItems.push({
          type: "text",
          text:
            "Search Results:\n\n" +
            formattedResults.join("\n") +
            (images.length > 0
              ? `\n\n${images.length} screenshot(s) included below for visual analysis:`
              : ""),
        });

        // Add images if requested and available
        for (const img of images) {
          // Add context for the image
          contentItems.push({
            type: "text",
            text: `\n📷 ${img.context}`,
          });
          // Add the image itself
          contentItems.push({
            type: "image",
            data: img.data,
            mimeType: "image/png",
          });
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
