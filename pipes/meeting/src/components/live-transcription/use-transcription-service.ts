import { useRecentChunks } from './hooks/pull-meetings-from-screenpipe'
import { useTranscriptionStream } from './hooks/screenpipe-stream-transcription-api'
import { useBrowserTranscriptionStream } from './hooks/browser-stream-transcription-api'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useMeetingContext } from './hooks/storage-for-live-meeting'

type TranscriptionMode = 'browser' | 'screenpipe'

// Global state to prevent multiple instances
const GLOBAL_STATE = {
    isInitialized: false
}

export function useTranscriptionService(mode: TranscriptionMode = 'browser') {
    const { chunks, setChunks, isLoading, fetchRecentChunks } = useRecentChunks()
    const { onNewChunk } = useMeetingContext()
    const { startTranscriptionScreenpipe, stopTranscriptionScreenpipe } = useTranscriptionStream(setChunks)
    const { startTranscriptionBrowser, stopTranscriptionBrowser } = useBrowserTranscriptionStream(onNewChunk)
    const modeRef = useRef<TranscriptionMode | null>(null)
    const [isRecording, setIsRecording] = useState(false)
    const mountedRef = useRef(true)

    // Handle cleanup on unmount
    useEffect(() => {
        return () => {
            mountedRef.current = false
            if (modeRef.current === 'browser') {
                stopTranscriptionBrowser()
            } else {
                stopTranscriptionScreenpipe()
            }
            GLOBAL_STATE.isInitialized = false
            console.log('transcription service unmounted, cleaned up global state')
        }
    }, [stopTranscriptionBrowser, stopTranscriptionScreenpipe])

    // Handle visibility change
    useEffect(() => {
        const handleVisibilityChange = () => {
            console.log('visibility changed:', {
                state: document.visibilityState,
                isInitialized: GLOBAL_STATE.isInitialized,
                currentMode: modeRef.current
            })

            if (document.visibilityState === 'visible') {
                // Only restart if we were previously initialized but not currently running
                if (!GLOBAL_STATE.isInitialized && isRecording) {
                    console.log('restarting transcription after visibility change')
                    if (modeRef.current === 'browser') {
                        startTranscriptionBrowser()
                    } else {
                        startTranscriptionScreenpipe()
                    }
                    GLOBAL_STATE.isInitialized = true
                }
            } else {
                // Clean up when hidden
                if (GLOBAL_STATE.isInitialized) {
                    console.log('stopping transcription on visibility change')
                    if (modeRef.current === 'browser') {
                        stopTranscriptionBrowser()
                    } else {
                        stopTranscriptionScreenpipe()
                    }
                    GLOBAL_STATE.isInitialized = false
                }
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [isRecording, startTranscriptionBrowser, startTranscriptionScreenpipe, 
        stopTranscriptionBrowser, stopTranscriptionScreenpipe])

    // Initialize transcription on mount only if not already initialized
    useEffect(() => {
        modeRef.current = mode
        if (!mode || GLOBAL_STATE.isInitialized) {
            console.log('skipping transcription init:', {
                hasMode: !!mode,
                isInitialized: GLOBAL_STATE.isInitialized
            })
            return
        }

        console.log('initializing transcription:', { mode })
        if (mode === 'browser') {
            startTranscriptionBrowser()
        } else {
            startTranscriptionScreenpipe()
        }
        GLOBAL_STATE.isInitialized = true
        setIsRecording(true)
    }, [mode, startTranscriptionBrowser, startTranscriptionScreenpipe])

    const toggleRecording = useCallback(() => {
        const newState = !isRecording
        console.log('toggling recording:', {
            newState,
            currentMode: modeRef.current,
            isInitialized: GLOBAL_STATE.isInitialized
        })

        if (newState) {
            if (!GLOBAL_STATE.isInitialized) {
                if (modeRef.current === 'browser') {
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