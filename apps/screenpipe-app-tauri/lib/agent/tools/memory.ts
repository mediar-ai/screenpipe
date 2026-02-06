import { z } from 'zod';
import { ToolDefinition } from '../types';

export const searchContentTool: ToolDefinition = {
    name: 'search_content',
    description: `Search screenpipe's recorded content: screen text (OCR), audio transcriptions, and UI elements.
- 'q': Search keywords.
- 'content_type': 'all', 'ocr', 'audio', 'vision', 'input'.
- 'start_time': ISO 8601 UTC start time (REQUIRED).
- 'end_time': ISO 8601 UTC end time.
- 'limit': Max results (1-20).`,
    parameters: z.object({
        q: z.string().optional().describe('Search keywords.'),
        content_type: z.enum(['all', 'ocr', 'audio', 'vision', 'input']).optional().describe('Filter by type.'),
        limit: z.number().optional().describe('Max results (1-20). Default: 10'),
        start_time: z.string().describe('ISO 8601 UTC start time. REQUIRED.'),
        end_time: z.string().optional().describe('ISO 8601 UTC end time.'),
        app_name: z.string().optional().describe('Filter by app name.'),
        window_name: z.string().optional().describe('Filter by window title.'),
    }),
    execute: async (args: any) => {
        const queryParams = new URLSearchParams();
        if (args.q) queryParams.append('q', args.q);
        if (args.content_type) queryParams.append('content_type', args.content_type);
        if (args.limit) queryParams.append('limit', Math.min(args.limit, 20).toString());
        if (args.start_time) queryParams.append('start_time', args.start_time);
        if (args.end_time) queryParams.append('end_time', args.end_time);
        if (args.app_name) queryParams.append('app_name', args.app_name);
        if (args.window_name) queryParams.append('window_name', args.window_name);

        try {
            const response = await fetch(`http://localhost:3030/search?${queryParams.toString()}`);
            if (!response.ok) {
                return `Search failed: ${response.statusText}`;
            }

            const data = await response.json();
            const results = data.data || [];

            if (results.length === 0) {
                return 'No content found for the given criteria.';
            }

            return JSON.stringify(results, null, 2);
        } catch (error: any) {
            return `Error searching content: ${error.message}`;
        }
    },
};
