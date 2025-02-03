import { useRecentChunks } from './hooks/pull-meetings-from-screenpipe'
import { useTranscriptionStream } from './hooks/screenpipe-stream-transcription-api'
import { useBrowserTranscriptionStream } from './hooks/browser-stream-transcription-api'
import { useEffect, useRef } from 'react'
import { getLiveMeetingData } from './hooks/storage-for-live-meeting'
import { usePostHog } from 'posthog-js/react'

type TranscriptionMode = 'browser' | 'screenpipe'

export function useTranscriptionService(mode: TranscriptionMode = 'browser') {
  const { chunks, setChunks, isLoading, fetchRecentChunks } = useRecentChunks()
  const { startTranscriptionScreenpipe, stopTranscriptionScreenpipe } = useTranscriptionStream(setChunks)
  const { startTranscriptionBrowser, stopTranscriptionBrowser } = useBrowserTranscriptionStream(setChunks)
  const initRef = useRef(false)
  const modeRef = useRef<TranscriptionMode | null>(null)
  const posthog = usePostHog()

  // Load stored chunks only once
  useEffect(() => {
    const loadStoredChunks = async () => {
      if (initRef.current) return
      initRef.current = true
      
      const storedData = await getLiveMeetingData()
      if (storedData?.chunks) {
        console.log('transcription-service: loading stored chunks:', storedData.chunks.length)
        setChunks(storedData.chunks)
      }
    }
    loadStoredChunks()
  }, [setChunks])

  // Handle transcription mode initialization and changes
  useEffect(() => {
    // First mount or mode change
    if (modeRef.current !== mode) {
      console.log('transcription-service: mode', modeRef.current ? 'changed from ' + modeRef.current + ' to: ' + mode : 'initialized to: ' + mode)
      
      // Track mode change in PostHog
      posthog.capture('meeting_web_app_transcription_mode_changed', {
        from: modeRef.current || 'initial',
        to: mode
      })

      // Stop any existing transcription
      if (modeRef.current) {
        if (modeRef.current === 'browser') {
          stopTranscriptionBrowser()
        } else {
          stopTranscriptionScreenpipe()
        }
      }
      
      // Update mode ref before starting new transcription
      modeRef.current = mode
      
      // Start new transcription based on mode
      if (mode === 'screenpipe') {
        console.log('transcription-service: starting screenpipe transcription')
        posthog.capture('meeting_web_app_transcription_started', { mode: 'screenpipe' })
        startTranscriptionScreenpipe()
      } else {
        console.log('transcription-service: starting browser transcription')
        posthog.capture('meeting_web_app_transcription_started', { mode: 'browser' })
        startTranscriptionBrowser()
      }
    } else {
      console.log('transcription-service: mode unchanged:', mode)
    }

    // Cleanup function
    return () => {
      console.log('transcription-service: cleanup for mode:', modeRef.current)
      if (modeRef.current === 'browser') {
        stopTranscriptionBrowser()
      } else if (modeRef.current === 'screenpipe') {
        stopTranscriptionScreenpipe()
      }
      if (modeRef.current) {
        posthog.capture('meeting_web_app_transcription_stopped', { mode: modeRef.current })
      }
    }
  }, [mode, startTranscriptionScreenpipe, stopTranscriptionScreenpipe, startTranscriptionBrowser, stopTranscriptionBrowser, posthog])

  return {
    chunks,
    isLoadingRecent: isLoading,
    fetchRecentChunks
  }
} 