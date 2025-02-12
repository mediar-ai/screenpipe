import { useRecentChunks } from './hooks/pull-meetings-from-screenpipe'
import { useTranscriptionStream } from './hooks/screenpipe-stream-transcription-api'
import { useBrowserTranscriptionStream } from './hooks/browser-stream-transcription-api'
import { useEffect, useRef, useState, useCallback } from 'react'
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
  const [isRecording, setIsRecording] = useState(false)

  // Load stored chunks and check if archived
  useEffect(() => {
    const loadStoredChunks = async () => {
      if (initRef.current) return
      initRef.current = true
      
      const storedData = await getLiveMeetingData()
      if (storedData?.chunks) {
        console.log('transcription-service: loading stored chunks:', {
          count: storedData.chunks.length,
          isArchived: storedData.isArchived
        })
        setChunks(storedData.chunks)
        
        // Only auto-start if not archived
        if (!storedData.isArchived) {
          setIsRecording(true)
        }
      }
    }
    loadStoredChunks()
  }, [setChunks])

  // Update isRecording when transcription starts/stops
  const updateRecordingState = useCallback((recording: boolean) => {
    console.log('transcription-service: updating recording state:', recording)
    setIsRecording(recording)
  }, [])

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

      // Stop any existing transcription and update state
      if (modeRef.current) {
        if (modeRef.current === 'browser') {
          stopTranscriptionBrowser()
          updateRecordingState(false)
        } else {
          stopTranscriptionScreenpipe()
          updateRecordingState(false)
        }
      }
      
      modeRef.current = mode

      getLiveMeetingData().then(data => {
        if (data?.isArchived) {
          console.log('transcription-service: archived meeting detected, skipping auto-start')
          updateRecordingState(false)
          return
        }

        if (mode === 'screenpipe') {
          console.log('transcription-service: starting screenpipe transcription')
          startTranscriptionScreenpipe()
          updateRecordingState(true)
        } else {
          console.log('transcription-service: starting browser transcription')
          startTranscriptionBrowser()
          updateRecordingState(true)
        }
        posthog.capture('meeting_web_app_transcription_started', { mode: mode })
      })
    } else {
      console.log('transcription-service: mode unchanged:', mode)
    }

    // Cleanup function
    return () => {
      console.log('transcription-service: cleanup for mode:', modeRef.current)
      if (modeRef.current) {
        if (modeRef.current === 'browser') {
          stopTranscriptionBrowser()
        } else {
          stopTranscriptionScreenpipe()
        }
        updateRecordingState(false)
        posthog.capture('meeting_web_app_transcription_stopped', { mode: modeRef.current })
      }
    }
  }, [mode, startTranscriptionScreenpipe, stopTranscriptionScreenpipe, startTranscriptionBrowser, stopTranscriptionBrowser, posthog, updateRecordingState])

  const toggleRecording = useCallback(() => {
    const newState = !isRecording
    console.log('transcription-service: toggling recording:', newState)
    
    if (newState) {
      if (modeRef.current === 'browser') {
        startTranscriptionBrowser()
      } else {
        startTranscriptionScreenpipe()
      }
    } else {
      if (modeRef.current === 'browser') {
        stopTranscriptionBrowser()
      } else {
        stopTranscriptionScreenpipe()
      }
    }
    
    updateRecordingState(newState)
    posthog.capture('meeting_web_app_recording_toggled', { 
      mode: modeRef.current,
      state: newState ? 'started' : 'stopped'
    })
  }, [isRecording, startTranscriptionBrowser, startTranscriptionScreenpipe, stopTranscriptionBrowser, stopTranscriptionScreenpipe, posthog, updateRecordingState])

  return {
    chunks,
    isLoadingRecent: isLoading,
    fetchRecentChunks,
    isRecording,
    toggleRecording
  }
} 