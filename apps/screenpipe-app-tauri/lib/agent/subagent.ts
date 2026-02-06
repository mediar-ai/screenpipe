import { v4 as uuidv4 } from 'uuid';
import { runAgentLoop } from './loop';
import { AgentContext, ToolDefinition } from './types';
import { MessageBus } from './bus';
import { z } from 'zod';

export class SubagentManager {
    private static instance: SubagentManager;
    private runningTasks: Map<string, Promise<void>> = new Map();

    private constructor() { }

    public static getInstance(): SubagentManager {
        if (!SubagentManager.instance) {
            SubagentManager.instance = new SubagentManager();
        }
        return SubagentManager.instance;
    }

    public async spawn(
        task: string,
        context: AgentContext,
        apiKey: string,
        baseUrl?: string,
        label?: string
    ): Promise<string> {
        const taskId = uuidv4().slice(0, 8);
        const displayLabel = label || (task.length > 30 ? task.slice(0, 30) + '...' : task);

        const subagentPromise = this.runSubagent(taskId, task, displayLabel, context, apiKey, baseUrl);
        this.runningTasks.set(taskId, subagentPromise);

        // Cleanup when done
        subagentPromise.finally(() => {
            this.runningTasks.delete(taskId);
        });

        return `Subagent [${displayLabel}] started (id: ${taskId}). I'll notify you when it completes.`;
    }

    private async runSubagent(
        taskId: string,
        task: string,
        label: string,
        context: AgentContext,
        apiKey: string,
        baseUrl?: string
    ): Promise<void> {
        const bus = MessageBus.getInstance();

        try {
            // Enhanced subagent prompt
            const subagentContext: AgentContext = {
                ...context,
                systemPrompt: this.buildSubagentPrompt(task, context.systemPrompt),
            };

            const result = await runAgentLoop(task, subagentContext, apiKey, baseUrl);

            // Announce success
            bus.publishInbound({
                id: uuidv4(),
                sender: `subagent:${taskId}`,
                role: 'system',
                content: `[Subagent '${label}' completed successfully]\n\nTask: ${task}\n\nResult:\n${result.output}\n\nPlease summarize this for the user.`,
                channel: 'app',
                chatId: 'system',
                timestamp: Date.now(),
                metadata: { taskId, status: 'success', label }
            });

        } catch (error: any) {
            // Announce failure
            bus.publishInbound({
                id: uuidv4(),
                sender: `subagent:${taskId}`,
                role: 'system',
                content: `[Subagent '${label}' failed]\n\nTask: ${task}\n\nError: ${error.message}`,
                channel: 'app',
                chatId: 'system',
                timestamp: Date.now(),
                metadata: { taskId, status: 'error', label }
            });
        }
    }

    private buildSubagentPrompt(task: string, originalSystemPrompt: string): string {
        return `
# Subagent Role
You are a specialized subagent spawned to complete a specific task.

## Your assigned task:
${task}

## Rules:
1. Stay focused ONLY on the assigned task.
2. When finished, provide a clear and concise summary of your actions and findings.
3. You have access to tools for shell, filesystem, and web operations. Use them efficiently.
4. You do not talk directly to the user. Your output will be processed by the main agent.

## Original Context (for reference):
${originalSystemPrompt}
`.trim();
    }

    public getRunningCount(): number {
        return this.runningTasks.size;
    }
}

// Spawn Tool Factory
export function createSpawnTool(
    context: AgentContext,
    apiKey: string,
    baseUrl?: string
): ToolDefinition {
    return {
        name: 'spawn',
        description: 'Spawn a subagent to handle a task in the background. Use for complex or time-consuming tasks.',
        parameters: z.object({
            task: z.string().describe('The task for the subagent to complete'),
            label: z.string().optional().describe('An optional label for the task display'),
        }),
        execute: async (args: { task: string; label?: string }) => {
            const manager = SubagentManager.getInstance();
            return await manager.spawn(args.task, context, apiKey, baseUrl, args.label);
        },
    };
}

// Deprecated: Use createSpawnTool instead
// Note: This export requires an API key to be provided at runtime.
// Do not use in browser context without proper API key handling.
export function createDefaultSpawnTool(apiKey: string): ToolDefinition {
    return createSpawnTool(
        {
            model: 'gpt-4o',
            provider: 'openai',
            systemPrompt: 'You are a helpful assistant.',
            memoryEnabled: false
        },
        apiKey
    );
}
