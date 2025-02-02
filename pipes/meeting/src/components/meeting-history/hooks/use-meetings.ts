import { useCallback, useEffect, useState } from "react"
import { Meeting, AudioTranscription } from "../types"
import { keysToCamelCase } from "@/lib/utils"
import { getMeetings, setMeetings, cleanupOldMeetings } from "./storage-meeting-data"
import { v4 as uuidv4 } from "uuid"

export function useMeetings() {
  const [meetings, setMeetingsState] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const processMeetings = (transcriptions: AudioTranscription[]): Meeting[] => {
    console.log("processing transcriptions:", transcriptions)
    let meetings: Meeting[] = []
    let currentMeeting: Meeting | null = null

    // sort transcriptions by timestamp
    transcriptions.sort((a, b) => 
      new Date(a.content.timestamp).getTime() - new Date(b.content.timestamp).getTime()
    )

    transcriptions.forEach((trans, index) => {
      const currentTime = new Date(trans.content.timestamp)
      const prevTime = index > 0 ? new Date(transcriptions[index - 1].content.timestamp) : null

      // Get speaker name based on device type
      const speakerName = trans.content.deviceType?.toLowerCase() === "input"
        ? "you"
        : trans.content.deviceType?.toLowerCase() === "output"
        ? "others"
        : trans.content.speaker || "unknown"

      if (!currentMeeting || (prevTime && currentTime.getTime() - prevTime.getTime() >= 5 * 60 * 1000)) {
        if (currentMeeting) {
          meetings.push(currentMeeting)
        }
        currentMeeting = {
          id: uuidv4(),
          meetingStart: trans.content.timestamp,
          meetingEnd: trans.content.timestamp,
          humanName: null,
          aiName: null,
          agenda: null,
          aiSummary: null,
          participants: null,
          mergedWith: [],
          selectedDevices: new Set([trans.content.deviceName]),
          segments: [{
            timestamp: trans.content.timestamp,
            transcription: trans.content.transcription,
            deviceName: trans.content.deviceName,
            deviceType: trans.content.deviceType,
            speaker: trans.content.speaker || speakerName
          }],
          deviceNames: new Set([trans.content.deviceName]),
          notes: []
        }
      } else if (currentMeeting) {
        currentMeeting.meetingEnd = trans.content.timestamp
        currentMeeting.selectedDevices.add(trans.content.deviceName)
        currentMeeting.segments.push({
          timestamp: trans.content.timestamp,
          transcription: trans.content.transcription,
          deviceName: trans.content.deviceName,
          deviceType: trans.content.deviceType,
          speaker: trans.content.speaker || speakerName
        })
        currentMeeting.deviceNames.add(trans.content.deviceName)
      }
    })

    if (currentMeeting) {
      meetings.push(currentMeeting)
    }

    // sort meetings by start time
    meetings.sort((a, b) => 
      new Date(b.meetingStart).getTime() - new Date(a.meetingStart).getTime()
    )

    // remove duplicate meetings
    meetings = meetings.filter((meeting, index, self) =>
      index === self.findIndex((t) => t.id === meeting.id)
    )

    console.log("processed meetings:", meetings)
    // Filter meetings with substantial content (200+ total characters)
    return meetings.filter(m => {
      const totalLength = m.segments.reduce((acc, seg) => acc + seg.transcription.length, 0)
      console.log(`meeting ${m.id} total length: ${totalLength}`)
      return totalLength >= 200
    })
  }

  const fetchMeetings = useCallback(async () => {
    console.log("fetching meetings...")
    setLoading(true)
    try {
      // Get stored meetings first
      const storedMeetings = await getMeetings()
      console.log("loaded stored meetings:", storedMeetings.length)

      // Try to fetch new data from screenpipe
      try {
        const latestStoredTimestamp = storedMeetings.length > 0
          ? storedMeetings[0].meetingEnd
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

        console.log("fetching transcriptions after:", latestStoredTimestamp)
        
        const response = await fetch(
          `http://localhost:3030/search?content_type=audio&start_time=${latestStoredTimestamp}&limit=1000`,
          { signal: AbortSignal.timeout(5000) } // 5s timeout
        )
        
        if (!response.ok) {
          throw new Error("failed to fetch meeting history")
        }
        
        const result = await response.json()
        const camelCaseResult = keysToCamelCase<{ data: AudioTranscription[] }>(result)
        console.log("fetched new transcriptions:", camelCaseResult.data.length)
        
        const newMeetings = processMeetings(camelCaseResult.data)
        console.log("processed new meetings:", newMeetings.length)

        // Merge with stored meetings
        const mergedMeetings = [...newMeetings, ...storedMeetings]
          .reduce((acc, meeting) => {
            const existingIndex = acc.findIndex(m => m.id === meeting.id)
            if (existingIndex === -1) {
              acc.push(meeting)
            } else {
              acc[existingIndex] = {
                ...meeting,
                humanName: acc[existingIndex].humanName,
                aiName: acc[existingIndex].aiName,
                aiSummary: acc[existingIndex].aiSummary,
                participants: acc[existingIndex].participants
              }
            }
            return acc
          }, [] as Meeting[])

        mergedMeetings.sort((a, b) => 
          new Date(b.meetingStart).getTime() - new Date(a.meetingStart).getTime()
        )

        try {
          await setMeetings(mergedMeetings)
          setMeetingsState(mergedMeetings)
        } catch (storageError) {
          console.error("storage error, attempting cleanup:", storageError)
          await cleanupOldMeetings()
          await setMeetings(mergedMeetings.slice(-10))
          setMeetingsState(mergedMeetings.slice(-10))
        }

      } catch (apiError) {
        // If API is unavailable, just use stored meetings
        console.log("screenpipe api unavailable, using stored meetings:", apiError)
        setMeetingsState(storedMeetings)
      }
      
    } catch (err) {
      console.error("error fetching meetings:", err)
      setError(err instanceof Error ? err : new Error("Failed to fetch meetings"))
    } finally {
      setLoading(false)
    }
  }, [])

  // Update meetings helper that handles storage
  const updateMeetings = async (newMeetings: Meeting[]) => {
    try {
      await setMeetings(newMeetings)
      setMeetingsState(newMeetings)
    } catch (err) {
      console.error("failed to update meetings:", err)
      throw err
    }
  }

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  return { 
    meetings, 
    loading, 
    error, 
    refetch: fetchMeetings,
    updateMeetings
  }
}

// Helper function for timestamp formatting
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(date)
}