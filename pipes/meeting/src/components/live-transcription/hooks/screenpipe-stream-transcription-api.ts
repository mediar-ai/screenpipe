import { useRef, useCallback } from 'react'
import { useToast } from "@/hooks/use-toast"
import { TranscriptionChunk } from '../../meeting-history/types'

declare global {
  interface Window {
    _eventSource?: EventSource;
  }
}

export function useTranscriptionStream(
  onNewChunk: (chunk: TranscriptionChunk) => void
) {
  const streamingRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastProcessedRef = useRef<number>(Date.now()) // Clean state: Only show NEW speech
  const { toast } = useToast()

  const stopTranscriptionScreenpipe = useCallback(() => {
    console.log('stopping screenpipe transcription', {
      isStreaming: streamingRef.current,
      hasAbortController: !!abortControllerRef.current
    })

    if (window._eventSource) {
      window._eventSource.close()
      window._eventSource = undefined
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    streamingRef.current = false
  }, [])

  const startTranscriptionScreenpipe = useCallback(async () => {
    if (streamingRef.current) {
      console.log('transcription already streaming')
      return
    }

    try {
      console.log('starting transcription polling (fallback for missing SSE)...')
      streamingRef.current = true
      // Reset last processed time to NOW. 
      // This means "hi" will NOT appear. Only NEW words you speak from now on.
      lastProcessedRef.current = Date.now()

      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      // Use polling since SSE endpoint is 404
      const pollFunction = async () => {
        if (!streamingRef.current || signal.aborted) return

        try {
          // Fetch latest 5 audio items
          const response = await fetch('http://localhost:3030/search?limit=5&content_type=audio&order=desc')
          if (!response.ok) {
            console.error('polling failed:', response.statusText)
          } else {
            const data = await response.json()
            if (data.data) {
              // Process items in reverse (oldest first) so they appear in order
              const items = data.data.reverse()

              for (const item of items) {
                if (item.type !== 'Audio' || !item.content) continue

                const { transcription, timestamp, device_name, speaker } = item.content
                const itemTime = new Date(timestamp).getTime()

                // Deduplicate by timestamp
                if (itemTime <= lastProcessedRef.current) continue

                lastProcessedRef.current = itemTime

                if (!transcription) continue

                const newChunk: TranscriptionChunk = {
                  id: itemTime,
                  timestamp: timestamp,
                  text: transcription,
                  isInput: device_name?.toLowerCase().includes('input') || false,
                  device: device_name || 'unknown',
                  speaker: speaker || 'speaker_0'
                }

                console.log('emitting chunk:', newChunk)
                onNewChunk(newChunk)
              }
            }
          }
        } catch (err) {
          console.error('polling error:', err)
        }

        // Schedule next poll - FAST 500ms
        if (streamingRef.current && !signal.aborted) {
          setTimeout(pollFunction, 500)
        }
      }

      // Start polling loop
      pollFunction()

    } catch (error) {
      console.error("failed to start transcription:", error)
      streamingRef.current = false
      toast({
        title: "transcription error",
        description: "failed to stream audio. retrying...",
        variant: "destructive"
      })
      setTimeout(startTranscriptionScreenpipe, 1000)
    }
  }, [onNewChunk, toast])

  return {
    startTranscriptionScreenpipe,
    stopTranscriptionScreenpipe,
    isStreaming: streamingRef.current
  }
}