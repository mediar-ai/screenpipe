import { ToolDefinition } from './types';

export class ToolRegistry {
    private static instance: ToolRegistry;
    private tools: Map<string, ToolDefinition> = new Map();

    private constructor() { }

    public static getInstance(): ToolRegistry {
        if (!ToolRegistry.instance) {
            ToolRegistry.instance = new ToolRegistry();
        }
        return ToolRegistry.instance;
    }

    public register(tool: ToolDefinition) {
        this.tools.set(tool.name, tool);
    }

    public getTool(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }

    public getAllTools(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }
}
