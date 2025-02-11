'use client'

import { MeetingHistory } from "@/components/meeting-history/meeting-history"
import { MeetingProvider } from "@/components/live-transcription/hooks/storage-for-live-meeting"

export default function MeetingsPage() {
  return (
    <MeetingProvider>
      <MeetingHistory />
    </MeetingProvider>
  )
}