import type { Settings } from "@screenpipe/browser"
import { Note } from "../../meeting-history/types"
import { callOpenAI, createAiClient } from "./ai-client"

interface NoteContext {
    note: Note
    context: string  // Combined text with timestamps and speakers
    title?: string
}

export async function improveNote(
    context: NoteContext,
    settings: Settings
): Promise<string> {
    console.log("note ai settings:", {
        provider: settings.aiProviderType,
        has_token: !!settings.user?.token,
        has_key: !!settings.openaiApiKey,
        url: settings.aiUrl,
        model: settings.aiModel
    })

    const openai = createAiClient(settings)

    try {
        console.log("improving note with full context:", {
            note: context.note,
            context: context.context,
            title: context.title,
            settings: {
                provider: settings.aiProviderType,
                model: settings.aiModel
            }
        })

        const messages = [
            {
                role: "system" as const,
                content: `you are me, improving my meeting notes.
                         return a single, concise sentence in lowercase.
                         use the transcription context for accuracy.
                         focus on the key point or action item.
                         preserve any markdown formatting.
                         be brief and direct.`
            },
            {
                role: "user" as const,
                content: `improve this note considering the context:

                meeting title: ${context.title || 'unknown'}

                transcription context:
                ${context.context}

                note to improve:
                ${context.note.text}`
            }
        ]

        console.log("sending request to openai for note improvement")
        const response = await callOpenAI(openai, {
            model: settings.aiModel,
            messages,
            temperature: 0.3,
            max_tokens: context.note.text.length * 2,
        }, {
            maxRetries: 3,
            initialDelay: 1000
        })

        const improved = 'choices' in response 
            ? response.choices[0]?.message?.content?.trim() || context.note.text
            : context.note.text

        console.log("improved note:", {
            original: context.note.text,
            improved
        })

        return improved
    } catch (error) {
        console.error("error improving note:", {
            error,
            note_text: context.note.text,
            title: context.title,
            settings: {
                provider: settings.aiProviderType,
                model: settings.aiModel
            }
        })
        return context.note.text
    }
} 