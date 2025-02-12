import { useRecentChunks } from './hooks/pull-meetings-from-screenpipe'
import { useTranscriptionStream } from './hooks/screenpipe-stream-transcription-api'
import { useBrowserTranscriptionStream } from './hooks/browser-stream-transcription-api'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useMeetingContext } from './hooks/storage-for-live-meeting'

type TranscriptionMode = 'browser' | 'screenpipe'

export function useTranscriptionService(mode: TranscriptionMode = 'browser') {
  const { chunks, setChunks, isLoading, fetchRecentChunks } = useRecentChunks()
  const { onNewChunk } = useMeetingContext()
  const { startTranscriptionScreenpipe, stopTranscriptionScreenpipe } = useTranscriptionStream(setChunks)
  const { startTranscriptionBrowser, stopTranscriptionBrowser } = useBrowserTranscriptionStream(onNewChunk)
  const modeRef = useRef<TranscriptionMode | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const mountedRef = useRef(true)

  // Initialize transcription on mount only
  useEffect(() => {
    modeRef.current = mode
    if (!mode) return

    if (mode === 'browser') {
      startTranscriptionBrowser()
    } else {
      startTranscriptionScreenpipe()
    }
    setIsRecording(true)

    return () => {
      if (!mountedRef.current) {
        if (modeRef.current === 'browser') {
          stopTranscriptionBrowser()
        } else {
          stopTranscriptionScreenpipe()
        }
        setIsRecording(false)
      }
    }
  }, [])

  // Track unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const toggleRecording = useCallback(() => {
    const newState = !isRecording
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
    setIsRecording(newState)
  }, [isRecording, startTranscriptionBrowser, startTranscriptionScreenpipe, 
      stopTranscriptionBrowser, stopTranscriptionScreenpipe])

  return {
    chunks,
    isLoadingRecent: isLoading,
    fetchRecentChunks,
    isRecording,
    toggleRecording
  }
} 