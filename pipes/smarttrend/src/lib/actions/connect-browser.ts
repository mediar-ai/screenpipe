"use server";

export async function getBrowserWSEndpoint(): Promise<string> {
  const response = await fetch("http://127.0.0.1:9222/json/version");
  if (!response.ok) {
    throw new Error("failed to get fresh websocket url");
  }
  const data = (await response.json()) as { webSocketDebuggerUrl: string };
  return data.webSocketDebuggerUrl.replace(
    "ws://localhost:",
    "ws://127.0.0.1:",
  );
}
