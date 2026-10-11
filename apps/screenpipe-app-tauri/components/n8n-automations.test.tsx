// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { N8nAutomations } from "./n8n-automations";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), open: vi.fn() }));
vi.mock("@/lib/api", () => ({ localFetch: mocks.fetch }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.open }));
vi.mock("@/components/settings/custom-mcp-card", () => ({
  ServerEditor: ({ initial }: any) => (
    <div data-testid="editor">{initial.url}</div>
  ),
}));
const server = {
  id: "n8n-a",
  name: "n8n",
  url: "https://example.com/mcp-server/http",
  enabled: true,
  header_names: [],
  created_at: 0,
};
const tools = [
  "create_workflow_from_code",
  "validate_workflow",
  "search_nodes",
  "get_node_types",
  "get_workflow_sdk_reference",
  "search_workflows",
].map((name) => ({ name }));
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
beforeEach(() => {
  vi.clearAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function connected(
  availableTools = tools,
  result: any = {
    structuredContent: {
      data: [{ id: "invoice/1", name: "Save invoices", active: false }],
    },
  },
) {
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path === "/mcp-servers") return response({ data: [server] });
    if (path.endsWith("/tools"))
      return response({ data: { tools: availableTools } });
    if (path.endsWith("/call")) return response({ data: result });
    throw new Error("Unexpected request");
  });
}
describe("n8n Automations", () => {
  it("opens the existing auth editor with a normalized URL, keeps drafting available before connecting", async () => {
    mocks.fetch.mockResolvedValue(response({ data: [] }));
    render(<N8nAutomations />);
    fireEvent.change(await screen.findByLabelText("n8n URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save invoice attachments" }),
    );
    expect(
      screen
        .getByRole("button", { name: "Build with agent" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Connect n8n" }));
    expect(await screen.findByTestId("editor")).toHaveTextContent(server.url);
  });
  it("enables building only after capability discovery, and opens the actual workflow URL", async () => {
    connected();
    render(<N8nAutomations />);
    fireEvent.change(screen.getByLabelText("What should the workflow do?"), {
      target: { value: "Save invoices" },
    });
    await screen.findByText("Connected · Workflow builder available");
    expect(
      screen
        .getByRole("button", { name: "Build with agent" })
        .hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.click(
      await screen.findByRole("button", { name: /Save invoices Draft/ }),
    );
    expect(mocks.open).toHaveBeenCalledWith(
      "https://example.com/workflow/invoice%2F1",
    );
    const call = mocks.fetch.mock.calls.find(([path]) =>
      path.endsWith("/call"),
    );
    expect(JSON.parse(call![1].body)).toEqual({
      tool: "search_workflows",
      arguments: { limit: 20 },
    });
    expect(
      mocks.fetch.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
  });
  it("does not mistake an execution-only connection for a builder", async () => {
    connected([{ name: "search_workflows" }, { name: "execute_workflow" }]);
    render(<N8nAutomations />);
    await screen.findByText(/Connected, but workflow building is unavailable/);
    fireEvent.change(screen.getByLabelText("What should the workflow do?"), {
      target: { value: "Save invoices" },
    });
    expect(
      screen
        .getByRole("button", { name: "Build with agent" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("shows provider failures instead of false empty or connected states", async () => {
    connected(tools, {
      isError: true,
      content: [{ type: "text", text: "Denied" }],
    });
    render(<N8nAutomations />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load workflows",
    );
    expect(screen.queryByText(/No workflows found/)).toBeNull();
    cleanup();
    mocks.fetch.mockRejectedValue(new Error("Unavailable"));
    render(<N8nAutomations />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load n8n connections",
    );
    expect(
      screen.queryByText("Connected · Workflow builder available"),
    ).toBeNull();
  });
  it("keeps a draft across tab unmounts", async () => {
    mocks.fetch.mockResolvedValue(response({ data: [] }));
    render(<N8nAutomations />);
    await screen.findByLabelText("n8n URL");
    fireEvent.change(screen.getByLabelText("What should the workflow do?"), {
      target: { value: "My unfinished request" },
    });
    cleanup();
    render(<N8nAutomations />);
    await waitFor(() =>
      expect(screen.getByLabelText("What should the workflow do?")).toHaveValue(
        "My unfinished request",
      ),
    );
  });
});
