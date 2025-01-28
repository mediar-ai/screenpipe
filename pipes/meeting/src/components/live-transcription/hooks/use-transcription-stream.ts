import { useRef } from 'react'
import { pipe } from "@screenpipe/browser"
import { useToast } from "@/hooks/use-toast"
import { TranscriptionChunk, ServiceStatus } from '../types'

export function useTranscriptionStream(
  serviceStatus: ServiceStatus,
  setChunks: (updater: (prev: TranscriptionChunk[]) => TranscriptionChunk[]) => void
) {
  const streamingRef = useRef(false)
  const { toast } = useToast()

  const startTranscription = async () => {
    if (streamingRef.current) {
      console.log('already streaming, skipping')
      return
    }

    try {
      console.log('starting transcription stream')
      streamingRef.current = true
      
      for await (const chunk of pipe.streamTranscriptions()) {
        console.log('new transcription chunk:', chunk)
        
        if (chunk.choices && chunk.choices[0]) {
          setChunks(prev => [...prev, {
            timestamp: new Date(chunk.created).toISOString(),
            text: chunk.choices[0].text || '',
            isInput: chunk.metadata?.isInput ?? true,
            device: chunk.metadata?.device || 'unknown'
          }])
        }
      }
    } catch (error) {
      console.error("transcription stream error:", error)
      if (serviceStatus === 'available') {
        toast({
          title: "transcription error", 
          description: "failed to stream audio. retrying...",
          variant: "destructive"
        })
        streamingRef.current = false
        setTimeout(startTranscription, 1000)
      }
    } finally {
      streamingRef.current = false
    }
  }

  return { startTranscription, isStreaming: streamingRef.current }
} 