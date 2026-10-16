// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { describe, it, expect } from "vitest";
import { request } from "node:http";
import { buildHttpServer } from "./http-server";

describe("HTTP MCP browser boundary", () => {
  it("rejects rebinding and cross-origin requests before creating a session", async () => {
    const server = buildHttpServer({ host: "127.0.0.1", mcpPort: 0, screenpipePort: 1 });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw Error("no listener");
    const port = address.port;
    const call = (headers: Record<string, string | undefined>, method = "POST", path = "/mcp") => new Promise<{status: number; session?: string; body: string}>((resolve, reject) => {
      const req = request({ hostname: "127.0.0.1", port, method, path, headers: {
        "content-type": "application/json", accept: "application/json, text/event-stream", ...headers,
      } }, res => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => resolve({status: res.statusCode!, session: res.headers["mcp-session-id"] as string | undefined, body}));
      });
      req.on("error", reject);
      req.end(method === "POST" ? JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"boundary-test",version:"1"}}}) : undefined);
    });
    try {
      for (const headers of [
        {host: `rebind.example:${port}`, origin: `http://rebind.example:${port}`},
        {host: `rebind.example:${port}`},
        {host: `127.0.0.1:${port}`, origin: "https://evil.example"},
        {host: `localhost:${port}`, origin: "null"},
        {host: `localhost.evil.example:${port}`},
        {host: `127.0.0.1:${port}`, origin: "http://localhost@evil.example"},
      ]) {
        const result = await call(headers);
        expect(result.status, JSON.stringify(headers)).toBe(401);
        expect(result.session).toBeUndefined();
      }
      const health = await call({host:`127.0.0.1:${port}`}, "GET", "/health");
      expect(JSON.parse(health.body).sessions).toBe(0);
      const native = await call({host:`127.0.0.1:${port}`});
      expect(native.status).toBe(200);
      expect(native.session).toBeTruthy();
      const localBrowser = await call({host:`localhost:${port}`, origin:`http://localhost:${port}`});
      expect(localBrowser.status).toBe(200);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
