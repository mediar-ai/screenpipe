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
      if (query) params.set('q', query);
      if (contentType) params.set('content_type', contentType);
      // only allow chrome for now
      params.set('app_name', 'Arc');
      if (startTime) params.set('start_time', startTime);
      if (endTime) params.set('end_time', endTime);
      params.set('limit', '20');
      params.set('min_length', '10');

      const response = await fetch(`http://localhost:3030/search?${params}`);
      if (!response.ok) {
        console.error('0xHypr', 'Screenpipe search failed:', await response.text());
        return { error: `Screenpipe search failed: ${response.statusText}` };
      }

      const data = await response.json();
      return data.data as ScreenpipeSearchResult[];
    } catch (error) {
      console.error('0xHypr', 'Error in screenpipe search:', error);
      return { error: 'Failed to search Screenpipe' };
    }
  },
}); 