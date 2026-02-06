import { z } from 'zod';
import { Command } from '@tauri-apps/plugin-shell';
import { platform } from '@tauri-apps/plugin-os';
import { ToolDefinition } from '../types';

export const shellExecTool: ToolDefinition = {
    name: 'shell_exec',
    description: 'Execute a shell command and return its output.',
    parameters: z.object({
        command: z.string().describe('The shell command to execute'),
    }),
    execute: async ({ command }: { command: string }) => {
        try {
            // Detect OS and use appropriate shell
            const currentPlatform = await platform();
            const isWindows = currentPlatform === 'windows';
            
            // Note: In Tauri v2, you might need to use specific scoped commands 
            // or configure permissions in capabilities.
            const cmd = isWindows 
                ? Command.create('cmd.exe', ['/C', command])
                : Command.create('sh', ['-c', command]);
            const output = await cmd.execute();

            let result = output.stdout;
            if (output.stderr) {
                result += `\nErrors:\n${output.stderr}`;
            }

            if (output.code !== 0) {
                result += `\nExit code: ${output.code}`;
            }

            return result || '(no output)';
        } catch (error: any) {
            return `Error executing command: ${error.message}`;
        }
    },
};
