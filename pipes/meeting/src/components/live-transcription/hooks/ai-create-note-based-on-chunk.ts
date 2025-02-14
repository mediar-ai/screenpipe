import type { Settings } from "@screenpipe/browser"
import { TranscriptionChunk } from "../../meeting-history/types"
import { callOpenAI, createAiClient } from "./ai-client"

export async function generateMeetingNote(
    chunks: TranscriptionChunk[],
    settings: Settings,
    existingNotes: string[] = []
): Promise<string> {
    const openai = createAiClient(settings)
    const transcript = chunks
        .map(c => `[${c.speaker ?? 'unknown'}]: ${c.text}`)
        .join("\n")

    try {
        console.log("generating meeting note from chunks:", {
            chunks_count: chunks.length,
            existing_notes_count: existingNotes.length
        })

        const existingNotesContext = existingNotes.length > 0 
            ? `existing notes from this meeting:\n${existingNotes.join("\n")}\n\n`
            : ""

        const messages = [
            {
                role: "system" as const,
                content: `generate a single, concise note about what happened in this segment.
                         be factual and specific.
                         focus on the key point or action item.
                         keep it a few word sentence.
                         do not use quotes.
                         do not use wrapping words like "disucssion on", jump straight into note.
                         avoid repeating information from existing notes.`
            },
            {
                role: "user" as const,
                content: `${existingNotesContext}conversation transcript:
                ${transcript}`
            }
        ]

        // console.log("sending request to openai for note generation")
        const response = await callOpenAI(openai, {
            model: settings.aiModel,
            messages,
            temperature: 0.3,
            max_tokens: 60,
        }, {
            maxRetries: 3,
            initialDelay: 1000
        })

        // Handle both streaming and non-streaming responses
        const note = 'choices' in response 
            ? response.choices[0]?.message?.content?.trim() || "failed to generate note"
            : "failed to generate note"
        
        // console.log("AI note generated:", { note })
        return note

    } catch (error) {
        // Log error details for debugging but with lower severity
        console.log("note generation failed:", {
            error,
            chunks_count: chunks.length,
            transcript_length: transcript.length,
            has_existing_notes: existingNotes.length > 0
        })
        
        // Return empty string instead of error message to avoid showing errors in UI
        return ""
    }
} 