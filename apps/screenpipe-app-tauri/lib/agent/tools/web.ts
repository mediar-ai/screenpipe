import { z } from 'zod';
import { ToolDefinition } from '../types';

// Simple HTML to text/markdown conversion inspired by Nanobot's regex approach
// but adapted for TypeScript/Browser environment.
function stripTags(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
}

function normalizeWhitespace(text: string): string {
    return text
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export const webSearchTool: ToolDefinition = {
    name: 'web_search',
    description: 'Search the web using Brave Search API. Returns titles, URLs, and snippets.',
    parameters: z.object({
        query: z.string().describe('The search query'),
        count: z.number().optional().describe('Number of results (1-10)'),
    }),
    execute: async ({ query, count }: { query: string; count?: number }) => {
        // Ideally BRAVE_API_KEY should be in settings, but we check env for now
        // consistent with nanobot logic.
        const apiKey = process.env.BRAVE_API_KEY;
        if (!apiKey) {
            return 'Error: BRAVE_API_KEY not configured in environment';
        }

        try {
            const n = Math.min(Math.max(count || 5, 1), 10);
            const response = await fetch(
                `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'X-Subscription-Token': apiKey,
                    },
                }
            );

            if (!response.ok) {
                return `Error searching web: ${response.statusText}`;
            }

            const data = await response.json();
            const results = data.web?.results || [];

            if (results.length === 0) {
                return `No results for: ${query}`;
            }

            let output = `Results for: ${query}\n\n`;
            results.forEach((item: any, i: number) => {
                output += `${i + 1}. ${item.title}\n   ${item.url}\n`;
                if (item.description) {
                    output += `   ${item.description}\n`;
                }
                output += '\n';
            });

            return output;
        } catch (error: any) {
            return `Error: ${error.message}`;
        }
    },
};

export const webFetchTool: ToolDefinition = {
    name: 'web_fetch',
    description: 'Fetch a URL and extract readable content.',
    parameters: z.object({
        url: z.string().describe('The URL to fetch'),
    }),
    execute: async ({ url }: { url: string }) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                signal: controller.signal,
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                return `Error fetching URL: ${response.statusText}`;
            }

            const html = await response.text();

            // Basic extraction: title and stripped body text
            const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
            const title = titleMatch ? titleMatch[1] : 'Untitled Page';

            const content = normalizeWhitespace(stripTags(html));
            const truncatedContent = content.slice(0, 10000); // Limit to 10k chars for LLM safety

            let output = `# ${title}\n\n`;
            output += `URL: ${url}\n\n`;
            output += truncatedContent;

            if (content.length > 10000) {
                output += '\n\n... (content truncated)';
            }

            return output;
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return 'Error: Request timed out after 30 seconds';
            }
            return `Error: ${error.message}`;
        }
    },
};
