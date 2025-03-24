import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Anthropic from "@anthropic-ai/sdk";

class DesktopControlClient {
  private client: Client | null = null;
  private anthropic = new Anthropic();
  
  // Connect to the MCP server via stdio
  async connect(command: string, args: string[] = []) {
    console.log(`connecting to mcp server: ${command} ${args.join(' ')}`);
    
    try {
      const transport = new StdioClientTransport({
        command,
        args
      });
      
      this.client = new Client(
        {
          name: "desktop-control-client",
          version: "1.0.0"
        },
        {
          capabilities: {
            prompts: {},
            resources: {},
            tools: {}
          }
        }
      );
      
      await this.client.connect(transport);
      console.log('mcp client session established successfully');
      return true;
    } catch (error) {
      console.error('failed to establish mcp client session:', error);
      return false;
    }
  }
  
  // Check if connected
  isConnected(): boolean {
    return this.client !== null;
  }
  
  // List available resources
  async listResources() {
    if (!this.client) {
      console.error('cannot list resources: not connected');
      throw new Error('Not connected to MCP server');
    }
    
    try {
      const resources = await this.client.listResources();
      console.log('available resources:', resources);
      return resources;
    } catch (error) {
      console.error('failed to list resources:', error);
      throw error;
    }
  }
  
  // List available tools
  async listTools() {
    if (!this.client) {
      console.error('cannot list tools: not connected');
      throw new Error('Not connected to MCP server');
    }
    
    try {
      const tools = await this.client.listTools();
      console.log('available tools:', tools);
      return tools;
    } catch (error) {
      console.error('failed to list tools:', error);
      throw error;
    }
  }
  
  // Call a tool
  async callTool(name: string, args: Record<string, any>) {
    if (!this.client) {
      console.error('cannot call tool: not connected');
      throw new Error('Not connected to MCP server');
    }
    
    console.log(`calling tool "${name}" with args:`, args);
    try {
      const result = await this.client.callTool({
        name,
        arguments: args
      });
      console.log(`tool "${name}" result:`, result);
      return result;
    } catch (error) {
      console.error(`error calling tool "${name}":`, error);
      throw error;
    }
  }
  
  // Disconnect from the server
  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
        console.log('mcp client session closed');
      } catch (error) {
        console.error('error closing mcp client session:', error);
      } finally {
        this.client = null;
      }
    }
  }
}

// Export an instance that can be used throughout your application
export const desktopClient = new DesktopControlClient();
