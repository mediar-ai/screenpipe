import { OpenAI } from "openai"
import type { Settings } from "@screenpipe/browser"
import { TranscriptionChunk } from "../../meeting-history/types"

export async function generateMeetingNote(
    chunks: TranscriptionChunk[],
    settings: Settings
): Promise<string> {
    const openai = new OpenAI({
        apiKey: settings.aiProviderType === "screenpipe-cloud" 
            ? settings.user.token 
            : settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
    })

    try {
        console.log("generating meeting note from chunks:", {
            chunks_count: chunks.length
        })

        const transcript = chunks
            .map(c => `[${c.speaker ?? 'unknown'}]: ${c.text}`)
            .join("\n")

        const messages = [
            {
                role: "system" as const,
                content: `generate a single, concise first-person note about what happened in this meeting segment.
                         be factual and specific.
                         use "i" perspective.
                         keep it a few word sentence.
                         do not use quotes.`
            },
            {
                role: "user" as const,
                content: `conversation transcript:
                ${transcript}`
            }
        ]

        console.log("sending request to openai for note generation")
        const response = await openai.chat.completions.create({
            model: settings.aiModel,
            messages,
            temperature: 0.3,
            max_tokens: 60,
        })

        const note = response.choices[0]?.message?.content?.trim() || "failed to generate note"
        
        console.log("generated note:", { note })
        return note

    } catch (error) {
        console.error("error generating meeting note:", error)
        return "failed to generate note"
    }
} 