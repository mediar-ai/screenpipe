import { useRecentChunks } from './hooks/pull-meetings-from-screenpipe'
import { useTranscriptionStream } from './hooks/screenpipe-stream-transcription-api'
import { useBrowserTranscriptionStream } from './hooks/browser-stream-transcription-api'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useMeetingContext } from './hooks/storage-for-live-meeting'
import { usePostHog } from 'posthog-js/react'

type TranscriptionMode = 'browser' | 'screenpipe'

// Update GLOBAL_STATE to include health check result
const GLOBAL_STATE = {
    isInitialized: false,
    healthChecked: false,
    isHealthy: false
}

export function useTranscriptionService(mode?: TranscriptionMode) {
  const { chunks, setChunks, isLoading, fetchRecentChunks } = useRecentChunks()
  const { onNewChunk } = useMeetingContext()
  const { startTranscriptionScreenpipe, stopTranscriptionScreenpipe } = useTranscriptionStream(onNewChunk)
  const { startTranscriptionBrowser, stopTranscriptionBrowser } = useBrowserTranscriptionStream(onNewChunk)
  const modeRef = useRef<TranscriptionMode | null>(null)
  const posthog = usePostHog()
  const [isHealthChecking, setIsHealthChecking] = useState(true)

  // New state and refs for recording control
  const [isRecording, setIsRecording] = useState(false)
  const mountedRef = useRef(true)
  const isTransitioningRef = useRef(false)
  const keepRecordingRef = useRef(false)

  // Check health and determine initial mode
  const checkHealth = async () => {
    try {
      const response = await fetch('http://localhost:3030/health')
      const health = await response.json()
      
      if (health.status === 'healthy') {
        console.log('transcription-service: health check passed, using screenpipe')
        return 'screenpipe'
      } else {
        console.log('transcription-service: health check failed, using browser')
        return 'browser'
      }
    } catch (error) {
      console.log('transcription-service: health check error, using browser:', error)
      return 'browser'
    }
  }

  // Simplified initialization effect without interval
  useEffect(() => {
    const initializeTranscription = async () => {
      if (modeRef.current !== null) return // Already initialized

      setIsHealthChecking(true)
      
      // Only check health once
      let healthMode: TranscriptionMode
      if (!GLOBAL_STATE.healthChecked) {
        healthMode = await checkHealth()
        GLOBAL_STATE.healthChecked = true
        GLOBAL_STATE.isHealthy = healthMode === 'screenpipe'
      } else {
        healthMode = GLOBAL_STATE.isHealthy ? 'screenpipe' : 'browser'
        console.log('transcription-service: using cached health status:', healthMode)
      }

      const finalMode = mode || healthMode
      console.log('transcription-service: initializing with mode:', finalMode)
      
      modeRef.current = finalMode
      posthog.capture('meeting_web_app_transcription_mode_initialized', {
        mode: finalMode,
        requested_mode: mode,
        health_mode: healthMode,
        from_cache: GLOBAL_STATE.healthChecked
      })

      setIsHealthChecking(false)
    }

    initializeTranscription()
    // No more interval needed
  }, [mode, startTranscriptionScreenpipe, stopTranscriptionScreenpipe, startTranscriptionBrowser, stopTranscriptionBrowser, posthog])

  // Handle transcription mode initialization and changes
  useEffect(() => {
    if (isHealthChecking || !mode) return
    
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
  }, [mode, isHealthChecking, startTranscriptionScreenpipe, stopTranscriptionScreenpipe, startTranscriptionBrowser, stopTranscriptionBrowser, posthog])

  // Add toggle functionality
  const toggleRecording = useCallback(async (newState?: boolean) => {
    const nextState = newState ?? !isRecording
    console.log('toggling recording:', { 
      current: isRecording, 
      next: nextState,
      mode: modeRef.current
    })

    keepRecordingRef.current = nextState

    if (nextState) {
      if (!GLOBAL_STATE.isInitialized) {
        // Use current mode if none specified
        const currentMode = mode || modeRef.current
        if (!currentMode) {
          console.error('transcription-service: no mode available')
          return
        }
        
        modeRef.current = currentMode
        if (currentMode === 'browser') {
          startTranscriptionBrowser()
        } else {
          startTranscriptionScreenpipe()
        }
        GLOBAL_STATE.isInitialized = true
      }
    } else {
      // Stop transcription logic - Fix: Use modeRef.current instead of mode
      if (GLOBAL_STATE.isInitialized) {
        if (modeRef.current === 'browser') {
          stopTranscriptionBrowser()
        } else {
          stopTranscriptionScreenpipe()
        }
        GLOBAL_STATE.isInitialized = false
      }
    }
    setIsRecording(nextState)
  }, [isRecording, mode, startTranscriptionBrowser, startTranscriptionScreenpipe, 
      stopTranscriptionBrowser, stopTranscriptionScreenpipe])

  // Better cleanup on unmount
  useEffect(() => {
    console.log('transcription service mounted')
    mountedRef.current = true
    return () => {
      console.log('transcription service unmounting, keepRecording:', keepRecordingRef.current)
      mountedRef.current = false
      if (!keepRecordingRef.current) {
        isTransitioningRef.current = true
        if (modeRef.current === 'browser') {
          stopTranscriptionBrowser()
        } else {
          stopTranscriptionScreenpipe()
        }
        GLOBAL_STATE.isInitialized = false
        console.log('transcription service cleanup complete')
      }
    }
  }, [stopTranscriptionBrowser, stopTranscriptionScreenpipe])

  // Keep transcription active on tab visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      console.log('visibility changed, keeping transcription active:', {
        state: document.visibilityState
      })
      // No action taken on tab hidden/visible
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  return {
    chunks,
    isLoadingRecent: isLoading || isHealthChecking,
    fetchRecentChunks,
    isRecording,
    toggleRecording
  }
} 