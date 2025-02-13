import type { Settings } from "@screenpipe/browser"
import { LiveMeetingData } from "@/components/live-transcription/hooks/storage-for-live-meeting"
import { callOpenAI, createAiClient } from "./ai-client"

export async function generateMeetingName(
  meeting: LiveMeetingData,
  settings: Settings
): Promise<string> {
  const openai = createAiClient(settings)

  try {
    console.log(
      "generating ai name for meeting:", 
      {
        merged_chunks_count: meeting.mergedChunks.length,
        edited_chunks: Object.keys(meeting.editedMergedChunks || {}).length,
        notes_count: meeting.notes.length,
        has_analysis: !!meeting.analysis,
        title: meeting.title
      }
    )

    // Create prompt from chunks with edits and speaker mappings
    const transcriptSample = meeting.mergedChunks
      .map(chunk => {
        const text = meeting.editedMergedChunks[chunk.id] || chunk.text
        const speaker = meeting.speakerMappings[chunk.speaker || 'speaker_?'] || chunk.speaker || 'speaker_?'
        return `[${speaker}]: ${text}`
      })
      .join("\n")

    // Add notes and analysis context
    const notesContext = meeting.notes.length > 0 
      ? `\nMeeting notes:\n${meeting.notes.map(n => n.text).join("\n")}`
      : ""

    const analysisContext = meeting.analysis?.summary 
      ? `\nMeeting summary:\n${meeting.analysis.summary}`
      : ""

    const currentTitle = meeting.title
    const titleContext = currentTitle 
      ? `\nCurrent title: "${currentTitle}"\nPlease generate a new title that might be more accurate.`
      : ""

    const messages = [
      {
        role: "system" as const,
        content: "you are a helpful assistant that generates concise (max 6 words) but informative meeting titles. include key facts like participants, purpose, or project name if available. avoid generic descriptions.",
      },
      {
        role: "user" as const,
        content: `analyze the meeting context and generate a factual title that captures WHO (key participants/teams), WHAT (main topic/project), or WHY (purpose/goal) if these are clear from the context. keep it under 6 words:${titleContext}\n\n${transcriptSample}${notesContext}${analysisContext}`,
      },
    ]

    console.log("sending request to openai for meeting name", {
      current_title: currentTitle,
      segments_sample: transcriptSample.slice(0, 100) + "..."
    })

    const response = await callOpenAI(openai, {
      model: settings.aiModel,
      messages,
      temperature: 0.7,
      max_tokens: 20,
    }, {
      maxRetries: 3,
      initialDelay: 1000
    })

    const aiName = 'choices' in response 
        ? response.choices[0]?.message?.content?.trim() || currentTitle || "untitled meeting"
        : currentTitle || "untitled meeting"
        
    const sanitizedName = aiName.replace(/["']/g, '').replace(/[^\w\s-]/g, ' ').trim()
    console.log("sanitized ai name:", sanitizedName)
    return sanitizedName
  } catch (error) {
    console.error("error generating meeting name:", error)
    return meeting.title || "untitled meeting"
  }
}

// Helper function to generate names for multiple meetings
export async function generateMeetingNames(
  meetings: LiveMeetingData[],
  settings: Settings
): Promise<Record<string, string>> {
  const results: Record<string, string> = {}

  // Process meetings in parallel with a concurrency limit
  const concurrencyLimit = 2 // Reduced from 3 to match other files
  const chunks = []
  
  for (let i = 0; i < meetings.length; i += concurrencyLimit) {
    chunks.push(meetings.slice(i, i + concurrencyLimit))
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (meeting) => {
      const name = await generateMeetingName(meeting, settings)
      results[meeting.id] = name
    })

    await Promise.all(promises)
  }

  return results
} 