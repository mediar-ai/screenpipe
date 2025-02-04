import { OpenAI } from "openai"
import type { Settings } from "@screenpipe/browser"
import { TranscriptionChunk, Note } from "../../meeting-history/types"

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

    const openai = new OpenAI({
        apiKey: settings.aiProviderType === "screenpipe-cloud" 
            ? settings.user.token 
            : settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
    })

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

        console.log("improving note:", {
            note_text: context.note.text,
            context: context.context,
            title: context.title
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
        const response = await openai.chat.completions.create({
            model: settings.aiModel,
            messages,
            temperature: 0.3,
            max_tokens: context.note.text.length * 2,
        })

        const improved = response.choices[0]?.message?.content?.trim() || context.note.text

        console.log("improved note:", {
            original: context.note.text,
            improved
        })

        return improved
    } catch (error) {
        console.error("error improving note (full):", {
            error,
            context,
            settings: {
                provider: settings.aiProviderType,
                model: settings.aiModel
            }
        })
        return context.note.text
    }
} 