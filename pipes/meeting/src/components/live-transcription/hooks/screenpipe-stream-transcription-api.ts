import { useRef, useCallback } from 'react'
import { pipe } from "@screenpipe/browser"
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
  const { toast } = useToast()

  const stopTranscriptionScreenpipe = useCallback(() => {
    console.log('stopping screenpipe transcription', {
      isStreaming: streamingRef.current,
      hasAbortController: !!abortControllerRef.current
    })
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // Force disconnect the pipe stream
    pipe.disconnect()
    streamingRef.current = false
  }, [])

  const startTranscriptionScreenpipe = useCallback(async () => {
    if (streamingRef.current) {
      console.log('transcription already streaming')
      return
    }

    try {
      console.log('starting transcription stream...')
      streamingRef.current = true
      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      // Create a separate async function to handle the stream
      const handleStream = async () => {
        const stream = pipe.streamTranscriptions()
        try {
          for await (const chunk of stream) {
            // Check if aborted before processing each chunk
            if (signal.aborted) {
              console.log('stream aborted, breaking loop')
              break
            }
            
            console.log('new transcription chunk:', {
              text: chunk.choices[0]?.text,
              speaker: chunk.metadata?.speaker,
              model: chunk.model,
              device: chunk.metadata?.device
            })
            const transcriptionData = chunk.choices[0]?.text
            if (!transcriptionData) continue

            const isInput = chunk.metadata?.device?.toLowerCase().includes('input') ?? false
            const speaker = chunk.metadata?.speaker?.startsWith('speaker_') 
              ? chunk.metadata.speaker 
              : `speaker_${chunk.metadata?.speaker || '0'}`

            const newChunk: TranscriptionChunk = {
              id: Date.now(),
              timestamp: chunk.metadata?.timestamp || new Date().toISOString(),
              text: transcriptionData,
              isInput,
              device: chunk.metadata?.device || 'unknown',
              speaker
            }
            
            onNewChunk(newChunk)
          }
        } finally {
          // Ensure we clean up if the loop breaks
          console.log('stream loop ended')
          streamingRef.current = false
          pipe.disconnect() // Explicitly disconnect the stream
        }
      }

      // Start the stream handling
      handleStream().catch(error => {
        console.error('stream handler error:', error)
        streamingRef.current = false
        toast({
          title: "transcription error",
          description: "failed to stream audio. retrying...",
          variant: "destructive"
        })
        console.log('scheduling retry...')
        setTimeout(startTranscriptionScreenpipe, 1000)
      })

    } catch (error) {
      console.error("failed to start transcription:", error)
      streamingRef.current = false
      toast({
        title: "transcription error",
        description: "failed to stream audio. retrying...",
        variant: "destructive"
      })
      console.log('scheduling retry...')
      setTimeout(startTranscriptionScreenpipe, 1000)
    }
  }, [onNewChunk, toast])

  return { 
    startTranscriptionScreenpipe, 
    stopTranscriptionScreenpipe, 
    isStreaming: streamingRef.current 
  }
} 