import { Meeting } from "./types";
import { OpenAI } from "openai";
import type { Settings } from "@screenpipe/browser"

interface AiClientConfig {
  settings: Settings;
}

export function createAiClient({ settings }: AiClientConfig) {
  return new OpenAI({
    apiKey:
      settings.aiProviderType === "screenpipe-cloud"
        ? settings.user.token
        : settings.openaiApiKey,
    baseURL: settings.aiUrl,
    dangerouslyAllowBrowser: true,
  });
}

export async function generateMeetingName(
  meeting: Meeting,
  settings: Settings
): Promise<string> {
  const openai = createAiClient({ settings });

  try {
    console.log(
      "generating ai name for meeting:", 
      {
        id: meeting.id,
        segments_count: meeting.segments.length,
        notes_count: meeting.notes.length,
        total_transcript_length: meeting.segments.reduce((acc, s) => acc + s.transcription.length, 0),
        total_notes_length: meeting.notes.reduce((acc, n) => acc + n.text.length, 0)
      }
    );

    // Create prompt from meeting data
    const transcriptSample = meeting.segments
      .map(
        (s) =>
          `[${s.speaker}]: ${s.transcription}`
      )
      .join("\n");

    // Add notes context if available
    const notesContext = meeting.notes.length > 0 
      ? `\nMeeting notes:\n${meeting.notes.join("\n")}`
      : "";

    const currentTitle = meeting.humanName || meeting.aiName;
    const titleContext = currentTitle 
      ? `\nCurrent title: "${currentTitle}"\nPlease generate a new title that might be more accurate.`
      : "";

    const messages = [
      {
        role: "system" as const,
        content: "you are a helpful assistant that generates concise (max 6 words) but informative meeting titles. include key facts like participants, purpose, or project name if available. avoid generic descriptions.",
      },
      {
        role: "user" as const,
        content: `analyze the meeting context and generate a factual title that captures WHO (key participants/teams), WHAT (main topic/project), or WHY (purpose/goal) if these are clear from the context. keep it under 6 words:${titleContext}\n\n${transcriptSample}${notesContext}`,
      },
    ];

    console.log("sending request to openai for meeting name", {
      current_title: currentTitle,
      segments_sample: transcriptSample.slice(0, 100) + "..."
    });
    const response = await openai.chat.completions.create({
      model: settings.aiModel,
      messages,
      temperature: 0.7,
      max_tokens: 20,
    });

    const aiName = response.choices[0]?.message?.content?.trim() || "untitled meeting";
    // console.log("raw generated ai name:", aiName);
    
    // Sanitize the AI generated name
    const sanitizedName = aiName
      .replace(/["']/g, '') // Remove quotes
      .replace(/[^\w\s-]/g, ' ') // Replace special chars with space
      .trim();
    
    console.log("sanitized ai name:", sanitizedName);

    return sanitizedName;
  } catch (error) {
    console.error("error generating meeting name:", error);
    return "untitled meeting";
  }
}

// Helper function to generate names for multiple meetings
export async function generateMeetingNames(
  meetings: Meeting[],
  settings: Settings
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  // Process meetings in parallel with a concurrency limit
  const concurrencyLimit = 3;
  const chunks = [];
  
  for (let i = 0; i < meetings.length; i += concurrencyLimit) {
    chunks.push(meetings.slice(i, i + concurrencyLimit));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (meeting) => {
      const name = await generateMeetingName(meeting, settings);
      results[meeting.id] = name;
    });

    await Promise.all(promises);
  }

  return results;
} 