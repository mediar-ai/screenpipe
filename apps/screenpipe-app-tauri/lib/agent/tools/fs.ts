import { z } from 'zod';
import { readTextFile, writeTextFile, readDir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { ToolDefinition } from '../types';

export const fsReadTool: ToolDefinition = {
    name: 'fs_read',
    description: 'Read the contents of a file.',
    parameters: z.object({
        path: z.string().describe('The file path to read'),
    }),
    execute: async ({ path }: { path: string }) => {
        try {
            const content = await readTextFile(path);
            return content;
        } catch (error: any) {
            return `Error reading file: ${error.message}`;
        }
    },
};

export const fsWriteTool: ToolDefinition = {
    name: 'fs_write',
    description: 'Write content to a file.',
    parameters: z.object({
        path: z.string().describe('The file path to write to'),
        content: z.string().describe('The content to write'),
    }),
    execute: async ({ path, content }: { path: string; content: string }) => {
        try {
            await writeTextFile(path, content);
            return `Successfully wrote ${content.length} characters to ${path}`;
        } catch (error: any) {
            return `Error writing file: ${error.message}`;
        }
    },
};

export const fsListTool: ToolDefinition = {
    name: 'fs_list',
    description: 'List the contents of a directory.',
    parameters: z.object({
        path: z.string().describe('The directory path to list'),
    }),
    execute: async ({ path }: { path: string }) => {
        try {
            const entries = await readDir(path);
            const items = entries
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((entry) => {
                    const prefix = entry.isDirectory ? '📁 ' : '📄 ';
                    return `${prefix}${entry.name}`;
                });

            if (items.length === 0) {
                return `Directory ${path} is empty`;
            }

            return items.join('\n');
        } catch (error: any) {
            return `Error listing directory: ${error.message}`;
        }
    },
};

export const fsEditTool: ToolDefinition = {
    name: 'fs_edit',
    description: 'Edit a file by replacing old_text with new_text. The old_text must match exactly.',
    parameters: z.object({
        path: z.string().describe('The file path to edit'),
        old_text: z.string().describe('The exact text to find and replace'),
        new_text: z.string().describe('The text to replace with'),
    }),
    execute: async ({ path, old_text, new_text }: { path: string; old_text: string; new_text: string }) => {
        try {
            const content = await readTextFile(path);
            if (!content.includes(old_text)) {
                return `Error: text to replace not found in ${path}`;
            }

            // Simple replace (first occurrence recommended for safety, similar to Nanobot)
            const newContent = content.replace(old_text, new_text);
            await writeTextFile(path, newContent);
            return `Successfully edited ${path}`;
        } catch (error: any) {
            return `Error editing file: ${error.message}`;
        }
    },
};
