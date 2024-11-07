import { z } from "zod";
import { encode } from "./utils";

// Define types based on the server's schema
export type OCRContent = {
  frame_id: number;
  text: string;
  timestamp: string;
  file_path: string;
  offset_index: number;
  app_name: string;
  window_name: string;
  tags: string[];
  frame?: string;
};

export type AudioContent = {
  chunk_id: number;
  transcription: string;
  timestamp: string;
  file_path: string;
  offset_index: number;
  tags: string[];
  device_name: string;
  device_type: string;
};

export type FTSContent = {
  text_id: number;
  matched_text: string;
  frame_id: number;
  timestamp: string;
  app_name: string;
  window_name: string;
  file_path: string;
  original_frame_text?: string;
  tags: string[];
};

export type UIContent = {
  frame_id: number;
  timestamp: string;
  file_path: string;
  text: string;
  app_name: string;
  window_name: string;
  tags: string[];
};

export type ContentItem =
  | { type: "OCR"; content: OCRContent }
  | { type: "Audio"; content: AudioContent }
  | { type: "FTS"; content: FTSContent }
  | { type: "UI"; content: UIContent };

export type PaginationInfo = {
  limit: number;
  offset: number;
  total: number;
};

export type ScreenpipeResponse = {
  data: ContentItem[];
  pagination: PaginationInfo;
};

export const screenpipeQuery = z.object({
  q: z
    .string()
    .describe(
      `The search query matching exact keywords. 
      Use a single keyword that best matches the user intent. 
      This would match either audio transcription or OCR screen text. 
      
      Example: do not use 'discuss' the user ask about conversation, this is dumb, won't return any result
      Other example: 'what did i do this morning?' do not use any keywords, just look at everything

      In general avoid using "q" as it will filter out all data
      `
    )
    .optional(),
  content_type: z
    .enum(["ocr", "audio", "all"])
    .default("all")
    .describe(
      "The type of content to search for: screenshot data or audio transcriptions"
    ),
  limit: z
    .number()
    .default(50)
    .describe(
      "Number of results to return. Be mindful of the length of the response as it will be fed to an LLM"
    ),
  offset: z.number().default(0).describe("Offset for pagination (default: 0)"),
  start_time: z
    .string()
    // 1 hour ago
    .default(new Date(Date.now() - 3600000).toISOString())
    .describe(`Start time for search range in ISO 8601 format`),
  end_time: z
    .string()
    .default(new Date().toISOString())
    .describe(`End time for search range in ISO 8601 format`),
  app_name: z
    .string()
    .describe(
      `The name of the app the user was using. 
      This filter out all audio conversations. 
      Only works with screen text. 
      Use this to filter on the app context that would give context matching the user intent. 
      For example 'cursor'. Use lower case. 
      Browser is usually 'arc', 'chrome', 'safari', etc.
      Other apps can be 'whatsapp', 'obsidian', etc.
      `
    )
    .optional(),
  window_name: z
    .string()
    .describe(
      `The name of the window the user was using. 
      This helps to further filter the context within the app. 
      For example, 'inbox' for email apps, 'project' for project management apps, etc.
      `
    )
    .optional(), // Add window_name with description
  include_frames: z
    .boolean()
    .default(false)
    .describe("Include frames in the response"),
  min_length: z
    .number()
    .default(50)
    .describe("Minimum length of the text to include in the response"),
  max_length: z
    .number()
    .default(10000)
    .describe("Maximum length of the text to include in the response"),
});

export const screenpipeMultiQuery = z.object({
  queries: z.array(screenpipeQuery),
});

export async function queryScreenpipeNtimes(
  params: z.infer<typeof screenpipeMultiQuery>
): Promise<ScreenpipeResponse[]> {
  console.log("queryScreenpipeNtimes", params);
  const results = await Promise.all(params.queries.map(queryScreenpipe));
  return results.filter(
    (result): result is ScreenpipeResponse => result !== null
  );
}

// Add this new function to handle screenpipe requests
export async function queryScreenpipe(
  params: z.infer<typeof screenpipeQuery>
): Promise<ScreenpipeResponse | null> {
  try {
    console.log("params", params);

    const queryParams = new URLSearchParams({
      content_type: params.content_type,
      limit: params.limit.toString(),
      offset: params.offset.toString(),
      start_time: params.start_time,
      end_time: params.end_time,
      min_length: params.min_length.toString(),
      max_length: params.max_length.toString(),
      include_frames: params.include_frames.toString(),
    });

    if (params.q) queryParams.append("q", params.q);
    if (params.app_name) queryParams.append("app_name", params.app_name);
    if (params.window_name)
      queryParams.append("window_name", params.window_name);

    const url = `http://localhost:3030/search?${queryParams.toString()}`;
    console.log("calling screenpipe", url);

    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`http error! status: ${response.status} ${text}`);
    }
    const result = await response.json();
    console.log("result", result);
    console.log("result", result.data.length);
    return result;
  } catch (error) {
    console.error("error querying screenpipe:", error);
    return null;
  }
}
