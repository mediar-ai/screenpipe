// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { describe, expect, it } from "vitest";
import {
  canBuildN8nWorkflow,
  isN8nServer,
  n8nBaseUrl,
  n8nBuildPrefill,
  n8nEndpoint,
  parseN8nWorkflows,
} from "./n8n";
import type { McpServer } from "./mcp-registry";
const server: McpServer = {
  id: "my-n8n",
  name: "n8n",
  url: "https://example.com/automation/mcp-server/http",
  enabled: true,
  header_names: [],
  created_at: 0,
};
describe("n8n connection and handoff", () => {
  it("preserves self-hosted base paths and accepts copied endpoints", () => {
    expect(n8nEndpoint(" https://example.com/automation/ ")).toBe(server.url);
    expect(n8nEndpoint(`${server.url}/`)).toBe(server.url);
    expect(n8nBaseUrl(server.url)).toBe("https://example.com/automation");
    expect(n8nEndpoint("http://localhost:5678")).toBe(
      "http://localhost:5678/mcp-server/http",
    );
  });
  it.each([
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com?token=secret",
    "https://example.com#token",
    "javascript:alert(1)",
    "",
    "ftp://example.com",
  ])("rejects unsafe or ambiguous endpoint %s", (url) =>
    expect(() => n8nEndpoint(url)).toThrow(),
  );
  it("recognizes endpoints, not arbitrary names or stdio processes", () => {
    expect(isN8nServer(server)).toBe(true);
    expect(isN8nServer({ ...server, url: "https://example.com/mcp" })).toBe(
      false,
    );
    expect(isN8nServer({ ...server, transport: "stdio" })).toBe(false);
  });
  it("requires creation, validation and node schemas, including the old SDK tool name", () => {
    const tools = [
      "create_workflow_from_code",
      "validate_workflow",
      "search_nodes",
      "get_node_types",
      "get_sdk_reference",
    ].map((name) => ({ name }));
    expect(canBuildN8nWorkflow(tools)).toBe(true);
    expect(canBuildN8nWorkflow(tools.slice(1))).toBe(false);
    expect(canBuildN8nWorkflow([{ name: "execute_workflow" }])).toBe(false);
  });
  it("parses actual MCP envelopes and keeps unknown status distinct from a draft", () => {
    const data = [
      { id: "a", name: "Invoice filing", active: false },
      { id: "b", name: null, active: null },
    ];
    expect(parseN8nWorkflows({ structuredContent: { data } })[0].active).toBe(
      false,
    );
    expect(
      parseN8nWorkflows({
        content: [{ type: "text", text: JSON.stringify({ data }) }],
      })[1].active,
    ).toBeNull();
    expect(() =>
      parseN8nWorkflows({ isError: true, structuredContent: { data } }),
    ).toThrow();
    expect(() =>
      parseN8nWorkflows({
        content: [{ type: "text", text: "Permission denied" }],
      }),
    ).toThrow();
    expect(() =>
      parseN8nWorkflows({
        structuredContent: { data: [{ name: "Missing ID" }] },
      }),
    ).toThrow();
  });
  it("hands the chosen instance and request to chat without credential values", () => {
    const prefill = n8nBuildPrefill(server, " Save invoices ");
    expect(prefill.prompt).toBe("Save invoices");
    expect(prefill.context).toContain('Target MCP server ID: "my-n8n"');
    expect(prefill.context).toContain("Keep the new workflow unpublished");
    expect(prefill.context).toContain("not execution");
    expect(prefill.context).toContain("n8n Cloud cannot reach localhost");
    expect(prefill.context).not.toContain("Authorization:");
    expect(prefill.autoSend).toBe(true);
  });
});
