declare module 'mcp-server' {
  export class FastMCP {
    constructor(name: string);
    tool(config: any): void;
    run(options: { transport: string }): void;
  }
} 