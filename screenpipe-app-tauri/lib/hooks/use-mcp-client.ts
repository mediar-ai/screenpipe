"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = "http://localhost:3031/mcp";

interface McpClientState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

export function useMcpClient() {
  const [state, setState] = useState<McpClientState>({
    isConnected: false,
    isConnecting: false,
    error: null,
  });
  const clientRef = useRef<Client | null>(null);
  const transportRef = useRef<StreamableHTTPClientTransport | null>(null);

  // Connect to MCP server
  const connect = useCallback(async () => {
    if (clientRef.current || state.isConnecting) return;

    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
      transportRef.current = transport;

      const client = new Client(
        { name: "screenpipe-app", version: "1.0.0" },
        { capabilities: {} }
      );

      await client.connect(transport);
      clientRef.current = client;

      setState({ isConnected: true, isConnecting: false, error: null });
    } catch (error) {
      console.error("MCP connection error:", error);
      setState({
        isConnected: false,
        isConnecting: false,
        error: error instanceof Error ? error.message : "Failed to connect to MCP server",
      });
    }
  }, [state.isConnecting]);

  // Disconnect from MCP server
  const disconnect = useCallback(async () => {
    if (transportRef.current) {
      await transportRef.current.close();
      transportRef.current = null;
    }
    clientRef.current = null;
    setState({ isConnected: false, isConnecting: false, error: null });
  }, []);

  // Call a tool on the MCP server
  const callTool = useCallback(
    async (name: string, args: Record<string, unknown>): Promise<string> => {
      if (!clientRef.current) {
        // Try to connect first
        await connect();
        if (!clientRef.current) {
          throw new Error("MCP client not connected");
        }
      }

      try {
        const result = await clientRef.current.callTool({
          name,
          arguments: args,
        });

        // Extract text content from result
        const textContent = result.content
          ?.filter((block: any) => block.type === "text")
          .map((block: any) => block.text)
          .join("\n");

        return textContent || "No results";
      } catch (error) {
        console.error("MCP tool call error:", error);
        throw error;
      }
    },
    [connect]
  );

  // List available tools
  const listTools = useCallback(async () => {
    if (!clientRef.current) {
      await connect();
      if (!clientRef.current) {
        throw new Error("MCP client not connected");
      }
    }

    return await clientRef.current.listTools();
  }, [connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    callTool,
    listTools,
  };
}
