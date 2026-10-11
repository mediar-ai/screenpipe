// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import type { McpServer } from "@/lib/mcp-registry";
import type { ChatPrefillData } from "@/lib/chat-utils";

const MCP_PATH = "/mcp-server/http";

/** Accept an instance base URL or the URL copied from n8n's MCP settings. */
export function n8nEndpoint(input: string): string {
  const url = new URL(input.trim());
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use an HTTPS n8n URL without a password, query, or fragment. Localhost may use HTTP.",
    );
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith(MCP_PATH) ? path : `${path}${MCP_PATH}`;
  return url.toString();
}

export function isN8nServer(server: McpServer): boolean {
  if (server.transport === "stdio") return false;
  try {
    return (
      new URL(server.url).pathname.replace(/\/+$/, "").endsWith(MCP_PATH) &&
      n8nEndpoint(server.url) === server.url.replace(/\/+$/, "")
    );
  } catch {
    return false;
  }
}

export function n8nBaseUrl(endpoint: string): string {
  return n8nEndpoint(endpoint).slice(0, -MCP_PATH.length);
}

export function canBuildN8nWorkflow(tools: { name: string }[]): boolean {
  const names = new Set(tools.map((tool) => tool.name));
  return (
    names.has("create_workflow_from_code") &&
    names.has("validate_workflow") &&
    names.has("search_nodes") &&
    names.has("get_node_types") &&
    (names.has("get_workflow_sdk_reference") || names.has("get_sdk_reference"))
  );
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean | null;
}

/** MCP can return structuredContent or a JSON text block, including HTTP-200 errors. */
export function parseN8nWorkflows(result: any): N8nWorkflow[] {
  if (!result || result.isError)
    throw new Error(
      "n8n could not list workflows. Check access in n8n and retry.",
    );
  let payload = result.structuredContent;
  if (!payload) {
    for (const block of result.content ?? []) {
      if (block.type !== "text") continue;
      try {
        const value = JSON.parse(block.text);
        if (Array.isArray(value?.data)) {
          payload = value;
          break;
        }
      } catch {
        /* Non-JSON progress text is not a workflow list. */
      }
    }
  }
  if (!Array.isArray(payload?.data))
    throw new Error("n8n returned an unrecognized workflow list.");
  return payload.data.map((workflow: any) => {
    if (typeof workflow.id !== "string" || !workflow.id)
      throw new Error("n8n returned a workflow without an ID.");
    return {
      id: workflow.id,
      name:
        typeof workflow.name === "string" ? workflow.name : "Untitled workflow",
      active: typeof workflow.active === "boolean" ? workflow.active : null,
    };
  });
}

export function n8nBuildPrefill(
  server: McpServer,
  request: string,
): ChatPrefillData {
  return {
    displayLabel: `Build in n8n: ${request.trim()}`,
    prompt: request.trim(),
    autoSend: true,
    context: `Build a new n8n workflow for the user's request, using their connected n8n instance.
Target MCP server ID: ${JSON.stringify(server.id)}
Instance base URL: ${JSON.stringify(n8nBaseUrl(server.url))}

Use sp_mcp_list_tools for this server, then sp_mcp_call with its advertised schemas. If unavailable, explain the connection or capability gap and stop. Do not install a different server, use shell/API-key workarounds, or create a Screenpipe scheduled task instead.
Read get_workflow_sdk_reference (or the older get_sdk_reference), search_nodes, and get_node_types before writing SDK code. Clarify missing trigger, destination, or field mapping only when needed to build a useful draft. Use validate_workflow and fix errors before create_workflow_from_code. Search existing workflows before creation to avoid duplicating a prior attempt; never overwrite another workflow without the user's direction.
Keep the new workflow unpublished. This request authorizes draft creation only, not execution, publication, activation, outbound messages, or credential changes. Leave service credentials for the user to connect in n8n; do not ask for passwords or API keys in chat or copy Screenpipe credentials. These instructions guide the agent; existing runtime tool approval rules still apply.
Return the real workflow ID and editor URL from the successful result, a short description of its trigger and actions, and the exact accounts and fields still needed. Read back the created draft where permitted. Never report a mock, plan, or code snippet as a created workflow. Do not say it works until an authorized test has actually succeeded.
Screenpipe captures stay local unless the user explicitly chooses what to share. n8n Cloud cannot reach localhost on the user's computer. If the request needs local screen data, explain the missing bridge and propose an explicit, minimal payload handoff; do not expose the local API or embed its token in a workflow.
When done, direct the user to the n8n editor to connect accounts, review parameters, test, and publish.`,
  };
}
