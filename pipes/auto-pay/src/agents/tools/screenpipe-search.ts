import { z } from 'zod';
import { tool } from 'ai';

export interface ScreenpipeSearchResult {
  type: string;
  content: {
    text: string;
    timestamp: string;
    frame_id?: number;
    file_path?: string;
    offset_index?: number;
    app_name?: string;
    window_name?: string;
    tags?: string[];
  };
}

// Clean and sanitize search query to prevent FTS5 syntax errors
function sanitizeSearchQuery(query: string): string {
  // Remove special characters that can cause FTS5 syntax errors
  return query
    .replace(/[#"*^{}[\]()~?\\]/g, ' ')  // Remove special chars that break FTS5
    .replace(/\s+/g, ' ')                 // Normalize whitespace
    .trim();                              // Remove leading/trailing whitespace
}

export const screenpipeSearch = tool({
  description: `
    Search Screenpipe's local database (OCR, audio, UI captures).
    Provide a query or keywords, optional appName, startTime, endTime, etc.
  `,
  parameters: z.object({
    query: z.string().optional(),
    contentType: z.enum(['ocr', 'audio', 'ui']).optional(),
    appName: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  }),
  execute: async ({ query, contentType, appName, startTime, endTime }) => {
    try {
      const params = new URLSearchParams();
      
      // Sanitize and validate query if present
      if (query) {
        const sanitizedQuery = sanitizeSearchQuery(query);
        if (sanitizedQuery) {
          params.set('q', sanitizedQuery);
        }
      }

      if (contentType) params.set('content_type', contentType);
      // only allow chrome for now
      params.set('app_name', 'Arc');
      if (startTime) params.set('start_time', startTime);
      if (endTime) params.set('end_time', endTime);
      params.set('limit', '20');
      params.set('min_length', '10');

      const response = await fetch(`http://localhost:3030/search?${params}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('0xHypr', 'Screenpipe search failed:', errorText);
        
        try {
          // Try to parse error as JSON
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.includes('fts5: syntax error')) {
            // If it's an FTS5 syntax error, try again with more aggressive query sanitization
            if (query) {
              const fallbackQuery = query.replace(/[^\w\s]/g, ' ').trim();
              if (fallbackQuery) {
                params.set('q', fallbackQuery);
                const retryResponse = await fetch(`http://localhost:3030/search?${params}`);
                if (retryResponse.ok) {
                  const data = await retryResponse.json();
                  return data.data as ScreenpipeSearchResult[];
                }
              }
            }
          }
        } catch (parseError) {
          // Error text wasn't JSON, continue with normal error handling
        }

        return { 
          error: `Screenpipe search failed: ${response.status} ${response.statusText}`,
          details: errorText
        };
      }

      const data = await response.json();
      
      // Validate response structure
      if (!data || !Array.isArray(data.data)) {
        console.error('0xHypr', 'Invalid response format from Screenpipe:', data);
        return { error: 'Invalid response format from Screenpipe' };
      }

      return data.data as ScreenpipeSearchResult[];
    } catch (error) {
      console.error('0xHypr', 'Error in screenpipe search:', error);
      return { 
        error: 'Failed to search Screenpipe',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  },
}); 