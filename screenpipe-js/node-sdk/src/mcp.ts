import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { pipe } from ".";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { createServer } from "net";

/**
 * Finds an available port starting from a preferred port
 * @param preferred The preferred port to start checking from
 * @returns A promise that resolves to an available port
 */
export function findAvailablePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.on("error", (err: NodeJS.ErrnoException) => {
      // Port is in use, try the next one
      if (err.code === "EADDRINUSE") {
        findAvailablePort(preferred + 1)
          .then(resolve)
          .catch(reject);
      } else {
        reject(err);
      }
    });

    server.listen(preferred, () => {
      const { port } = server.address() as { port: number };
      server.close(() => {
        resolve(port);
      });
    });
  });
}

interface ClickElementInput {
  app: string;
  window?: string;
  text?: string;
  role?: string;
  label?: string;
}

interface FillTextInput {
  app: string;
  window?: string;
  text?: string;
  label?: string;
  value: string;
}

interface ListElementsInput {
  app: string;
  window?: string;
  text_only?: boolean;
  max_elements?: number;
}

interface OpenApplicationInput {
  application_name: string;
}

interface OpenUrlInput {
  url: string;
  browser?: string;
}

// Create the server
const server = new McpServer({
  name: "computer-control-sdk",
  version: "1.0.0",
});

// Tool 1: Get text from an application
server.tool(
  "get_text",
  {
    app: z
      .string()
      .describe("The application name (e.g., 'Chrome', 'Firefox')"),
    window: z.string().optional().describe("Optional window name"),
  },
  async ({ app, window }: { app: string; window?: string }) => {
    console.log(`executing get_text for app: ${app}`);

    try {
      const result = await pipe.operator.getText({
        app,
        window,
      });

      return {
        content: [
          {
            type: "text",
            text: result.text,
          },
        ],
      };
    } catch (error) {
      console.error("error in get_text:", error);
      return {
        content: [
          {
            type: "text",
            text: `failed to get text: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 2: Click an element
server.tool(
  "click_element",
  {
    app: z
      .string()
      .describe(
        "The name of the application (e.g., 'Chrome', 'Firefox', 'Safari')"
      ),
    window: z.string().optional().describe("Optional window name"),
    text: z
      .string()
      .optional()
      .describe("Text content of the element to click"),
    role: z
      .string()
      .optional()
      .describe("Role of the element (e.g., 'button', 'checkbox', 'link')"),
    label: z.string().optional().describe("Accessibility label of the element"),
  },
  async (input: ClickElementInput) => {
    console.log(
      `executing click_element for app: ${input.app}, text: ${input.text}`
    );

    try {
      const result = await pipe.operator.click({
        app: input.app,
        window: input.window,
        text: input.text,
        role: input.role,
        label: input.label,
      });

      console.log(`click result: ${JSON.stringify(result)}`);
      return {
        content: [
          {
            type: "text",
            text: `successfully clicked element using ${result.method}`,
          },
        ],
      };
    } catch (error) {
      console.error("error in click_element:", error);
      return {
        content: [
          {
            type: "text",
            text: `failed to click element: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 3: Fill a text field
server.tool(
  "fill_text",
  {
    app: z
      .string()
      .describe(
        "The name of the application (e.g., 'Chrome', 'Firefox', 'Safari')"
      ),
    window: z.string().optional().describe("Optional window name"),
    text: z.string().optional().describe("Text content of the field to target"),
    label: z.string().optional().describe("Accessibility label of the field"),
    value: z.string().describe("The text to type into the field"),
  },
  async (input: FillTextInput) => {
    console.log(`executing fill_text for app: ${input.app}`);

    try {
      const success = await pipe.operator.fill({
        app: input.app,
        window: input.window,
        text: input.text,
        label: input.label,
        value: input.value,
      });

      console.log(`fill result: ${success}`);
      return {
        content: [
          {
            type: "text",
            text: success
              ? `successfully entered text`
              : `failed to enter text`,
          },
        ],
      };
    } catch (error) {
      console.error("error in fill_text:", error);
      return {
        content: [
          {
            type: "text",
            text: `failed to fill text field: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 4: List interactable elements
server.tool(
  "list_interactable_elements",
  {
    app: z
      .string()
      .describe(
        "The name of the application (e.g., 'Chrome', 'Firefox', 'Safari')"
      ),
    window: z.string().optional().describe("Optional window name"),
    text_only: z
      .boolean()
      .optional()
      .describe("Only include elements with text"),
    max_elements: z
      .number()
      .optional()
      .describe("Maximum number of elements to return"),
  },
  async (input: ListElementsInput) => {
    console.log(`executing list_interactable_elements for app: ${input.app}`);

    try {
      const result = await pipe.operator.getInteractableElements({
        app: input.app,
        window: input.window,
        withTextOnly: input.text_only,
        maxElements: input.max_elements,
      });

      console.log(`found ${result.elements.length} interactable elements`);

      // Format the output in a readable way
      const elementList = result.elements
        .map((e) => `${e.index}: ${e.role} "${e.text}" (${e.interactability})`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `interactable elements in ${input.app}:\n${elementList}`,
          },
        ],
      };
    } catch (error) {
      console.error("error in list_interactable_elements:", error);
      return {
        content: [
          {
            type: "text",
            text: `failed to list interactable elements: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 5: Open an application
server.tool(
  "open_application",
  {
    application_name: z
      .string()
      .describe(
        "The name of the application to open (e.g., 'Chrome', 'Firefox', 'Safari')"
      ),
  },
  async (input: OpenApplicationInput) => {
    console.log(`executing open_application: ${input.application_name}`);

    try {
      const success = await pipe.operator.openApplication(
        input.application_name
      );

      console.log(`open application result: ${success}`);
      return {
        content: [
          {
            type: "text",
            text: success
              ? `successfully opened application '${input.application_name}'`
              : `failed to open application '${input.application_name}'`,
          },
        ],
      };
    } catch (error) {
      console.error("error in open_application:", error);
      return {
        content: [
          {
            type: "text",
            text: `failed to open application: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 6: Open a URL in a browser
server.tool(
  "open_url",
  {
    url: z.string().describe("The URL to open"),
    browser: z
      .string()
      .optional()
      .describe(
        "The browser to use (e.g., 'Chrome', 'Firefox'). If not specified, uses the default browser."
      ),
  },
  async (input: OpenUrlInput) => {
    console.log(
      `executing open_url: ${input.url}${
        input.browser ? ` in ${input.browser}` : ""
      }`
    );

    try {
      const success = await pipe.operator.openUrl(input.url, input.browser);

      console.log(`open url result: ${success}`);
      return {
        content: [
          {
            type: "text",
            text: success
              ? `successfully opened url '${input.url}'${
                  input.browser ? ` in ${input.browser}` : ""
                }`
              : `failed to open url '${input.url}'`,
          },
        ],
      };
    } catch (error) {
      console.error("error in open_url:", error);
      return {
        content: [
          {
            type: "text",
            text: `failed to open url: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Set up Express server for SSE
const app = express();
let port: number;

// Create a function to find an available port
async function startServer() {
  // Try to find an available port starting from a preferred one
  port = await findAvailablePort(3001);

  // Start server on the available port
  app.listen(port, () => {
    console.log(`mcp server running at http://localhost:${port}`);
  });

  // Update the client transport URL to use the dynamic port
  const clientTransport = new SSEClientTransport(
    new URL(`http://localhost:${port}/sse`)
  );

  mcpClient.connect(clientTransport);
}

// Server-side transports should use SSEServerTransport, not SSEClientTransport
const transports: Record<string, SSEServerTransport> = {};

// SSE endpoint
app.get("/sse", async (_, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports[transport.sessionId];
  });
  await server.connect(transport);
});

// Message handling endpoint
app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("no transport found for sessionid");
  }
});

// Define the client but don't connect yet (since we don't know the port)
const mcpClient = new Client(
  {
    name: "example-client",
    version: "1.0.0",
  },
  {
    capabilities: {
      prompts: {},
      resources: {},
      tools: {},
    },
  }
);

// Start the server and connect the client
startServer();

export default mcpClient;
