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
    if (streamingRef.current) return
    
    try {
      streamingRef.current = true
      const eventSource = new EventSource('http://localhost:3030/sse/transcriptions')
      let currentChunk: TranscriptionChunk | null = null
      
      eventSource.onmessage = (event) => {
        if (event.data === 'keep-alive-text') return
        
        const chunk = JSON.parse(event.data)
        console.log('new transcription chunk:', chunk)
        
        // If same speaker, append text with typing effect
        if (currentChunk && currentChunk.speaker === chunk.speaker) {
          const words = chunk.transcription.split(' ')
          let wordIndex = 0
          
          const typeWords = () => {
            if (wordIndex < words.length) {
              currentChunk!.text += (currentChunk!.text ? ' ' : '') + words[wordIndex]
              setChunks(prev => [...prev.slice(0, -1), { ...currentChunk! }])
              wordIndex++
              setTimeout(typeWords, 20)
            }
          }
          
          typeWords()
        } else {
          // New speaker or first chunk, create new entry
          currentChunk = {
            timestamp: chunk.timestamp,
            text: chunk.transcription,
            isInput: chunk.is_input,
            device: chunk.device,
            speaker: chunk.speaker
          }
          setChunks(prev => [...prev, currentChunk!])
        }
      }

      eventSource.onerror = (error) => {
        console.error("transcription stream error:", error)
        eventSource.close()
        streamingRef.current = false
        if (serviceStatus === 'available') {
          toast({
            title: "transcription error",
            description: "failed to stream audio. retrying...",
            variant: "destructive"
          })
          setTimeout(startTranscription, 1000)
        }
      }
    } catch (error) {
      console.error("transcription stream error:", error)
      streamingRef.current = false
    }
  }

  return { startTranscription, isStreaming: streamingRef.current }
} 