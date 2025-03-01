import { OpenAI } from "openai"
import type { Settings } from "@screenpipe/browser"
import { Meeting } from "../../meeting-history/types"
import { callOpenAI, createAiClient } from "./ai-client"

export interface MeetingAnalysis {
    facts: string[]
    events: string[]
    flow: string[]
    decisions: string[]
    summary: string[]
}

async function extractFacts(
    transcript: string,
    title: string,
    openai: OpenAI,
    settings: Settings
): Promise<string[]> {
    const systemPrompt = `extract meeting facts if any`
    console.log("extracting facts from meeting", { systemPrompt })
    
    const response = await callOpenAI(openai, {
        model: settings.aiModel,
        messages: [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: `meeting: ${title}\n\ntranscript:\n${transcript}`
            }
        ],
        temperature: 0.1,
        max_tokens: 500,
    })

    // Handle both streaming and non-streaming responses
    if (response && 'choices' in response && Array.isArray(response.choices)) {
        return response.choices[0]?.message?.content
            ?.split('\n')
            .filter(fact => fact.trim())
            .map(fact => fact.replace(/^[•-]\s*/, '').trim()) || []
    }
    return []
}

async function extractEvents(
    transcript: string,
    title: string,
    openai: OpenAI,
    settings: Settings
): Promise<string[]> {
    const systemPrompt = `extract events of the meeting if any`
    console.log("extracting discussed events from meeting", { systemPrompt })
    
    const response = await callOpenAI(openai, {
        model: settings.aiModel,
        messages: [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: `meeting: ${title}\n\ntranscript:\n${transcript}`
            }
        ],
        temperature: 0.2,
        max_tokens: 500,
    })
    
    if (response && 'choices' in response && Array.isArray(response.choices)) {
        return response.choices[0]?.message?.content
            ?.split('\n')
            .filter(event => event.trim())
            .map(event => event.replace(/^[•-]\s*/, '').trim()) || []
    }
    return []
}

async function extractFlow(
    transcript: string,
    title: string,
    openai: OpenAI,
    settings: Settings
): Promise<string[]> {
    const systemPrompt = `in a few words what the meeting is`
    console.log("extracting meeting flow", { systemPrompt })
    
    const response = await callOpenAI(openai, {
        model: settings.aiModel,
        messages: [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: `meeting: ${title}\n\ntranscript:\n${transcript}`
            }
        ],
        temperature: 0.3,
        max_tokens: 500,
    })
    
    if (response && 'choices' in response && Array.isArray(response.choices)) {
        return response.choices[0]?.message?.content
            ?.split('\n')
            .filter(flow => flow.trim())
            .map(flow => flow.replace(/^[•-]\s*/, '').trim()) || []
    }
    return []
}

async function extractDecisions(
    transcript: string,
    title: string,
    openai: OpenAI,
    settings: Settings
): Promise<string[]> {
    const systemPrompt = `extract decisions from transcript if any`
    console.log("extracting decisions and next steps", { systemPrompt })
    
    const response = await callOpenAI(openai, {
        model: settings.aiModel,
        messages: [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: `meeting: ${title}\n\ntranscript:\n${transcript}`
            }
        ],
        temperature: 0.2,
        max_tokens: 500,
    })
    
    if (response && 'choices' in response && Array.isArray(response.choices)) {
        return response.choices[0]?.message?.content
            ?.split('\n')
            .filter(decision => decision.trim())
            .map(decision => decision.replace(/^[•-]\s*/, '').trim()) || []
    }
    return []
}

export async function generateMeetingNotes(
    meeting: Meeting,
    settings: Settings
): Promise<MeetingAnalysis> {
    const openai = createAiClient(settings)

    try {
        console.log("analyzing meeting:", {
            meeting_id: meeting.id,
            meeting_name: meeting.humanName || meeting.aiName,
            segments_count: meeting.segments?.length || 0,
            notes_count: meeting.notes?.length || 0
        })

        // combine transcript with existing notes for context
        const transcript = (meeting.segments || [])
            .map(s => `[${s.speaker ?? 'unknown'}]: ${s.transcription}`)
            .join("\n")
            
        const existingNotes = (meeting.notes || [])
            .map(n => `[${n.timestamp.toString()}] ${n.text}`)
            .join("\n")
            
        const title = meeting.humanName || meeting.aiName || 'unknown'

        // modify system prompts to consider existing notes
        const systemPrompt = `you are me, a participant in this meeting. review the transcript and my existing notes.
                             synthesize everything into clear, actionable notes that i can refer to later.
                             focus on what's most relevant and important from my perspective.
                             write in a natural, first-person style and return as bullet points.`

        // Run extractions sequentially instead of parallel to avoid rate limits
        const facts = await extractFacts(
            `transcript:\n${transcript}\n\nexisting notes:\n${existingNotes}`, 
            title, 
            openai, 
            settings
        )
        
        const events = await extractEvents(
            `transcript:\n${transcript}\n\nexisting notes:\n${existingNotes}`, 
            title, 
            openai, 
            settings
        )
        
        const flow = await extractFlow(
            `transcript:\n${transcript}\n\nexisting notes:\n${existingNotes}`, 
            title, 
            openai, 
            settings
        )
        
        const decisions = await extractDecisions(
            `transcript:\n${transcript}\n\nexisting notes:\n${existingNotes}`, 
            title, 
            openai, 
            settings
        )

        // Generate final combined notes
        console.log("generating final combined notes with manual notes context")
        const response = await callOpenAI(openai, {
            model: settings.aiModel,
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: `meeting: ${title}
                    
                    manual notes:
                    ${existingNotes}
                    
                    analyzed components:
                    facts:
                    ${facts.join('\n')}
                    
                    events:
                    ${events.join('\n')}
                    
                    flow:
                    ${flow.join('\n')}
                    
                    decisions:
                    ${decisions.join('\n')}`
                }
            ],
            temperature: 0.3,
            max_tokens: 1000,
        }, {
            maxRetries: 3,
            initialDelay: 2000
        })

        const notes = response && 'choices' in response && Array.isArray(response.choices)
            ? response.choices[0]?.message?.content
                ?.split('\n')
                .filter(note => note.trim())
                .map(note => note.replace(/^[•-]\s*/, '').trim()) || []
            : []

        console.log("completed meeting analysis:", {
            facts_count: facts.length,
            events_count: events.length,
            flow_count: flow.length,
            decisions_count: decisions.length,
            final_notes_count: notes.length
        })

        const summarySystemPrompt = `you are me, summarize these meeting notes in 3-4 key points that i should remember.
                                    and return as bullet points.`

        console.log("generating concise summary")
        const summaryResponse = await callOpenAI(openai, {
            model: settings.aiModel,
            messages: [
                {
                    role: "system", 
                    content: summarySystemPrompt
                },
                {
                    role: "user",
                    content: `${notes.join('\n')}`
                }
            ],
            temperature: 0.1,
            max_tokens: 300,
        })

        const summary = summaryResponse && 'choices' in summaryResponse && Array.isArray(summaryResponse.choices)
            ? summaryResponse.choices[0]?.message?.content
                ?.split('\n')
                .filter(note => note.trim())
                .map(note => note.replace(/^[•-]\s*/, '').trim()) || []
            : []

        return {
            facts,
            events,
            flow,
            decisions,
            summary
        }
    } catch (error) {
        console.error("error analyzing meeting:", {
            error,
            meeting_id: meeting.id,
            segments_count: meeting.segments?.length || 0
        })
        return {
            facts: [],
            events: [],
            flow: [],
            decisions: [],
            summary: []
        }
    }
}