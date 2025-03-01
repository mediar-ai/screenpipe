import { callOpenAI, createAiClient } from "./ai-client"
import type { Settings } from "@screenpipe/browser"
import { TranscriptionChunk } from "../../meeting-history/types"
import { VocabularyEntry, getVocabularyEntries } from "./storage-vocabulary"
import { Meeting } from "../../meeting-history/types"

interface TranscriptionContext {
    meetingTitle?: string
    recentChunks: TranscriptionChunk[]
    notes?: string[]
    vocabulary?: VocabularyEntry[]
}

export async function improveTranscription(
    text: string,
    context: TranscriptionContext,
    settings: Settings
): Promise<string> {
    const openai = createAiClient(settings)

    try {
        // Build context from recent chunks
        const recentTranscript = context.recentChunks
            .map(c => `[${c.speaker ?? 'unknown'}]: ${c.text}`)
            .join("\n")

        // Get vocabulary corrections if any
        const vocabulary = context.vocabulary || await getVocabularyEntries()
        const vocabContext = vocabulary.length > 0
            ? `Previous corrections:\n${vocabulary.map(v => 
                `"${v.original}" → "${v.corrected}"`
            ).join("\n")}`
            : ""

        const messages = [
            {
                role: "system" as const,
                content: `you are an expert at improving speech-to-text transcription quality. 
                         focus on fixing common transcription errors while preserving the original meaning.
                         use provided vocabulary corrections only for a very obvious very close match.
                         maintain original capitalization and punctuation style.
                         return only the improved text without any quotation marks or additional commentary.`
            },
            {
                role: "user" as const,
                content: `improve this transcription considering the context:

                meeting title: ${context.meetingTitle || 'unknown'}

                recent conversation:
                ${recentTranscript}

                ${vocabContext}

                notes context:
                ${context.notes?.join("\n") || 'no notes'}

                text to improve:
                ${text}`
            }
        ]

        // console.log("sending request to openai for transcription improvement")
        const response = await callOpenAI(openai, {
            model: settings.aiModel,
            messages,
            temperature: 0.3,
            max_tokens: text.length * 2,
        }, {
            maxRetries: 3,
            initialDelay: 1000
        })

        let improved = 'choices' in response 
            ? response.choices[0]?.message?.content?.trim() || text
            : text
        
        // Remove any quotation marks from the response
        improved = improved.replace(/^["']|["']$/g, '').trim()

        // console.log("improved transcription:", {
        //     original: text,
        //     improved
        // })

        return improved
    } catch (error) {
        // Log error details but at debug level
        console.debug("[transcription-improve] failed:", {
            error,
            text_length: text.length,
            context: {
                title: context.meetingTitle,
                chunks: context.recentChunks.length
            }
        })
        // Silently fallback to original text
        return text
    }
}

// Update batch processing to use throttling
export async function improveTranscriptionBatch(
    chunks: TranscriptionChunk[],
    meeting: Meeting,
    settings: Settings
): Promise<Record<number, string>> {
    const results: Record<number, string> = {}
    const vocabulary = await getVocabularyEntries()
    const openai = createAiClient(settings)

    // Process in smaller batches with built-in throttling
    const concurrencyLimit = 2 // Reduced from 3
    const batches = []
    
    for (let i = 0; i < chunks.length; i += concurrencyLimit) {
        batches.push(chunks.slice(i, i + concurrencyLimit))
    }

    for (const batch of batches) {
        const promises = batch.map(async (chunk, idx) => {
            const context: TranscriptionContext = {
                meetingTitle: meeting.humanName || meeting.aiName || undefined,
                recentChunks: chunks.slice(Math.max(0, idx - 5), idx + 5),
                notes: meeting.notes?.map(note => note.text),
                vocabulary
            }

            try {
                const improved = await improveTranscription(chunk.text, context, settings)
                results[idx] = improved
            } catch (error) {
                // Log at debug level for troubleshooting
                console.debug("[transcription-batch] chunk failed:", {
                    chunk_idx: idx,
                    error
                })
                results[idx] = chunk.text // Silently fallback to original
            }
        })

        await Promise.all(promises)
    }

    return results
} 