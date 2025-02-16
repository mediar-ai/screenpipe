import { useRecentChunks } from './hooks/pull-meetings-from-screenpipe'
import { useTranscriptionStream } from './hooks/screenpipe-stream-transcription-api'
import { useBrowserTranscriptionStream } from './hooks/browser-stream-transcription-api'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useMeetingContext } from './hooks/storage-for-live-meeting'
import { useSettings } from "@/lib/hooks/use-settings"

type TranscriptionMode = 'browser' | 'screenpipe'

// Global state to prevent multiple instances
const GLOBAL_STATE = {
    isInitialized: false
}

export function useTranscriptionService(mode?: TranscriptionMode) {
    const { settings } = useSettings()
    
    // Force browser mode regardless of settings
    const effectiveMode: TranscriptionMode = 'browser' // hardcoring until i change SDK for rtt with speaker support
    const { chunks, setChunks, isLoading, fetchRecentChunks } = useRecentChunks()
    const { onNewChunk } = useMeetingContext()
    const { startTranscriptionScreenpipe, stopTranscriptionScreenpipe } = useTranscriptionStream(setChunks)
    const { startTranscriptionBrowser, stopTranscriptionBrowser } = useBrowserTranscriptionStream(onNewChunk)
    const modeRef = useRef<TranscriptionMode | null>(null)
    const [isRecording, setIsRecording] = useState(false)
    const mountedRef = useRef(true)
    const isTransitioningRef = useRef(false)

    // Add ref to track if we want to keep recording
    const keepRecordingRef = useRef(false)

    // Handle cleanup on unmount
    useEffect(() => {
        console.log('transcription service mounted')
        mountedRef.current = true
        return () => {
            console.log('transcription service unmounting, keepRecording:', keepRecordingRef.current)
            mountedRef.current = false
            // Only cleanup if we don't want to keep recording
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

    // Remove or modify the visibilitychange listener to keep transcription active
    useEffect(() => {
        const handleVisibilityChange = () => {
            console.log('visibility changed, keeping transcription active:', {
                state: document.visibilityState
            });
            // No action is taken on tab hidden/visible
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // Initialize transcription on mount only if not already initialized
    useEffect(() => {
        modeRef.current = effectiveMode
        const isFromArchive = new URLSearchParams(window.location.search).get('from') === 'archive'
        
        if (!effectiveMode || GLOBAL_STATE.isInitialized || isTransitioningRef.current || isFromArchive) {
            console.log('skipping transcription init:', {
                hasMode: !!effectiveMode,
                isInitialized: GLOBAL_STATE.isInitialized,
                isTransitioning: isTransitioningRef.current,
                isFromArchive,
                mode: effectiveMode
            })
            return
        }

        console.log('initializing transcription:', { mode: effectiveMode })
        if (effectiveMode === 'browser') {
            startTranscriptionBrowser()
        } else {
            startTranscriptionScreenpipe()
        }
        GLOBAL_STATE.isInitialized = true
        setIsRecording(true)

        return () => {
            isTransitioningRef.current = true
            if (modeRef.current === 'browser') {
                stopTranscriptionBrowser()
            } else {
                stopTranscriptionScreenpipe()
            }
            GLOBAL_STATE.isInitialized = false
            console.log('transcription service cleanup complete')
            
            // Reset transition flag after a short delay
            setTimeout(() => {
                isTransitioningRef.current = false
            }, 100)
        }
    }, [effectiveMode, startTranscriptionBrowser, startTranscriptionScreenpipe, 
        stopTranscriptionBrowser, stopTranscriptionScreenpipe])

    const toggleRecording = useCallback(async (newState?: boolean) => {
        const nextState = newState ?? !isRecording
        console.log('toggling recording:', { 
            current: isRecording, 
            next: nextState,
            mode: effectiveMode
        })

        // Set keepRecording based on whether we're starting or stopping
        keepRecordingRef.current = nextState

        if (nextState) {
            if (!GLOBAL_STATE.isInitialized) {
                console.log('initializing transcription:', {
                    mode: effectiveMode
                })
                modeRef.current = effectiveMode
                if (effectiveMode === 'browser') {
                    startTranscriptionBrowser()
                } else {
                    startTranscriptionScreenpipe()
                }
                GLOBAL_STATE.isInitialized = true
            }
        } else {
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