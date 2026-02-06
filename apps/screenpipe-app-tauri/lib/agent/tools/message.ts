import { z } from 'zod';
import { ToolDefinition } from '../types';
import { MessageBus } from '../bus';
import { v4 as uuidv4 } from 'uuid';

export const messageTool: ToolDefinition = {
    name: 'message',
    description: 'Send a message to the user. Use this to communicate findings, ask questions, or provide updates.',
    parameters: z.object({
        content: z.string().describe('The message content to send.'),
        channel: z.string().optional().describe('The channel to send to (e.g., "telegram", "app"). Default: "app"'),
        chatId: z.string().optional().describe('The destination chat ID.'),
    }),
    execute: async (args: any, context?: any) => {
        const bus = MessageBus.getInstance();
        bus.publishOutbound({
            id: uuidv4(),
            recipient: 'user',
            role: 'assistant',
            content: args.content,
            channel: args.channel || context?.channel || 'app',
            chatId: args.chatId || context?.chatId || 'default',
            timestamp: Date.now(),
        });
        return 'Message sent.';
    },
};
