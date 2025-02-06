import { ContentItem } from "@screenpipe/js";
import { WorkLog } from "./types";
import { generateObject } from "ai";
import { ollama } from "ollama-ai-provider";
import { z } from "zod";

export const workLog = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

export async function generateWorkLog(
  screenData: ContentItem[],
  model: string,
  startTime: Date,
  endTime: Date,
  customPrompt?: string,
): Promise<WorkLog> {
  const enrichedPrompt = customPrompt || "";

  const defaultPrompt = `Based on the following screen data, generate a concise work activity log entry.
    Rules:
    - use the screen data to generate the log entry
    - focus on describing the activity and tags
    - use the following context to better understand the user's goals and priorities:

    ${enrichedPrompt}

    Screen data: ${JSON.stringify(screenData)}

    Return a JSON object with:
    {
        "title": "Brief title of the activity",
        "description": "Concise description of what was done",
        "tags": ["#tag1", "#tag2", "#tag3"]
    }`;

  console.log("enrichedPrompt prompt:", enrichedPrompt);

  const provider = ollama(model);
  const response = await generateObject({
    model: provider,
    messages: [{ role: "user", content: defaultPrompt }],
    schema: workLog,
  });

  const formatDate = (date: Date) => {
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return {
    ...response.object,
    startTime: formatDate(startTime),
    endTime: formatDate(endTime),
  };
}
