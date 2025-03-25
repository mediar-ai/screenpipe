async executeTool(toolName: string, args: any): Promise<string> {
  console.log(`executing tool ${toolName} with args: ${JSON.stringify(args)}`);
  
  const result = await this.session!.callTool(toolName, args);
  
  console.log(`tool result: ${result.substring(0, 100)}${result.length > 100 ? '...' : ''}`);
  return result;
}
