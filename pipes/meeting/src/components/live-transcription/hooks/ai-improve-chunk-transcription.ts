import { OpenAI } from "openai"
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
    const openai = new OpenAI({
        apiKey: settings.aiProviderType === "screenpipe-cloud" 
            ? settings.user.token 
            : settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
    })

    try {
        console.log("improving transcription quality:", {
            text_length: text.length,
            context: {
                has_title: !!context.meetingTitle,
                chunks_count: context.recentChunks.length,
                notes_count: context.notes?.length || 0,
                vocab_count: context.vocabulary?.length || 0
            }
        })

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
                         use provided vocabulary corrections and meeting context to improve accuracy.
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

        console.log("sending request to openai for transcription improvement")
        const response = await openai.chat.completions.create({
            model: settings.aiModel,
            messages,
            temperature: 0.3, // lower temperature for more consistent corrections
            max_tokens: text.length * 2, // allow some expansion
        })

        let improved = response.choices[0]?.message?.content?.trim() || text
        
        // Remove any quotation marks from the response
        improved = improved.replace(/^["']|["']$/g, '').trim()

        console.log("improved transcription:", {
            original: text,
            improved
        })

        return improved
    } catch (error) {
        console.error("error improving transcription:", error)
        return text
    }
}

// Helper to improve multiple chunks in parallel
export async function improveTranscriptionBatch(
    chunks: TranscriptionChunk[],
    meeting: Meeting,
    settings: Settings
): Promise<Record<number, string>> {
    const results: Record<number, string> = {}
    const vocabulary = await getVocabularyEntries()

    // Process in parallel with concurrency limit
    const concurrencyLimit = 3
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

            const improved = await improveTranscription(chunk.text, context, settings)
            results[idx] = improved
        })

        await Promise.all(promises)
    }

    return results
} 