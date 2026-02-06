import OpenAI from 'openai';
import { ToolRegistry } from './registry';
import { AgentContext, AgentResult } from './types';

export async function runAgentLoop(
    input: string | OpenAI.Chat.ChatCompletionMessageParam[],
    context: AgentContext,
    apiKey: string,
    baseUrl?: string,
    maxIterations: number = 5
): Promise<AgentResult> {
    const registry = ToolRegistry.getInstance();
    const tools = registry.getAllTools();

    // Map our ToolDefinition to OpenAI's tool format
    const openaiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: {
                type: 'object',
                properties: tool.parameters.shape,
                required: Object.keys(tool.parameters.shape),
            },
        },
    }));

    const openai = new OpenAI({
        apiKey,
        baseURL: baseUrl || 'https://api.openai.com/v1',
        dangerouslyAllowBrowser: true, // Necessary for Tauri frontend
    });

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: context.systemPrompt },
    ];

    if (Array.isArray(input)) {
        messages.push(...input);
    } else {
        messages.push({ role: 'user', content: input });
    }

    let iteration = 0;
    let finalOutput = '';
    const executedToolCalls: any[] = [];

    while (iteration < maxIterations) {
        iteration++;

        let response: OpenAI.Chat.Completions.ChatCompletion;
        try {
            response = await openai.chat.completions.create({
                model: context.model,
                messages,
                tools: openaiTools.length > 0 ? openaiTools : undefined,
            });
        } catch (error: any) {
            return {
                output: `Error calling OpenAI API: ${error.message}`,
                toolCalls: executedToolCalls,
            };
        }

        const choice = response.choices?.[0];
        if (!choice) {
            return {
                output: 'No response from model.',
                toolCalls: executedToolCalls,
            };
        }
        const assistantMessage = choice.message;

        if (assistantMessage.content) {
            finalOutput = assistantMessage.content;
        }

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            // Add assistant's message with tool calls to history
            messages.push(assistantMessage as OpenAI.Chat.ChatCompletionMessageParam);

            for (const toolCall of assistantMessage.tool_calls) {
                const tool = registry.getTool(toolCall.function.name);
                let result: string;

                if (tool) {
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        result = await tool.execute(args);
                    } catch (error: any) {
                        result = `Error executing tool: ${error.message}`;
                    }
                } else {
                    result = `Tool ${toolCall.function.name} not found`;
                }

                // Add tool result to history
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: result,
                });

                executedToolCalls.push({
                    tool: toolCall.function.name,
                    args: toolCall.function.arguments,
                    result,
                });
            }
        } else {
            // No tool calls, we're done
            break;
        }
    }

    return {
        output: finalOutput || 'Agent loop finished without specific output.',
        toolCalls: executedToolCalls,
    };
}
