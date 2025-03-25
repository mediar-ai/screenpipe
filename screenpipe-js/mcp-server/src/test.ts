import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

console.log("starting test server");

const server = new McpServer({
  name: "test-server",
  version: "1.0.0"
});

// Add simple echo tool
server.tool(
  "echo",
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: "text", text: `Echo: ${message}` }]
  })
);

// Start the server
const transport = new StdioServerTransport();
server.connect(transport)
  .then(() => console.log("test server started"))
  .catch((err) => console.error("test server error:", err)); 