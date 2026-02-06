import { type z } from 'zod';

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: z.ZodObject<any>;
    execute: (args: any) => Promise<string | any>;
}

export interface AgentContext {
    model: string;
    provider: string;
    systemPrompt: string;
    memoryEnabled: boolean;
}

export interface AgentResult {
    output: string;
    toolCalls?: any[];
}
