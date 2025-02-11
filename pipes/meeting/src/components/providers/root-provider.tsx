'use client'

import { MeetingProvider } from "@/components/live-transcription/hooks/storage-for-live-meeting"
import { SettingsProvider } from "@/lib/hooks/use-settings"
import PostHogProvider from "./posthog-provider"

export function RootProvider({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider>
      <SettingsProvider>
        <MeetingProvider>
          {children}
        </MeetingProvider>
      </SettingsProvider>
    </PostHogProvider>
  )
} 