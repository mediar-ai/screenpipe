import type { Settings } from "@screenpipe/browser"
import { TranscriptionChunk } from "../../meeting-history/types"
import { callOpenAI, createAiClient } from "./ai-client"

export async function generateMeetingNote(
    chunks: TranscriptionChunk[],
    settings: Settings,
    existingNotes: string[] = []
): Promise<string> {
    const openai = createAiClient(settings)

    try {
        console.log("generating meeting note from chunks:", {
            chunks_count: chunks.length,
            existing_notes_count: existingNotes.length
        })

        const transcript = chunks
            .map(c => `[${c.speaker ?? 'unknown'}]: ${c.text}`)
            .join("\n")

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

        const note = response.choices[0]?.message?.content?.trim() || "failed to generate note"
        
        // console.log("AI note generated:", { note })
        return note

    } catch (error) {
        console.error("error generating meeting note:", {
            error,
            chunks_count: chunks.length
        })
        return "failed to generate note"
    }
} 