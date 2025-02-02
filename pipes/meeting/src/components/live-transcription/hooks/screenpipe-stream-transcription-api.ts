import { useRef, useCallback } from 'react'
import { pipe } from "@screenpipe/browser"
import { useToast } from "@/hooks/use-toast"
import { TranscriptionChunk, ServiceStatus } from '../../meeting-history/types'

declare global {
  interface Window {
    _eventSource?: EventSource;
  }
}

export function useTranscriptionStream(
  setChunks: (updater: (prev: TranscriptionChunk[]) => TranscriptionChunk[]) => void
) {
  const streamingRef = useRef(false)
  const { toast } = useToast()

  const stopTranscriptionScreenpipe = useCallback(() => {
    if (window._eventSource) {
      console.log('stopping screenpipe transcription')
      window._eventSource.close()
      window._eventSource = undefined
      streamingRef.current = false
    }
  }, [])

  const startTranscriptionScreenpipe = useCallback(async () => {
    if (streamingRef.current) {
      console.log('transcription already streaming');
      return;
    }
    
    try {
      console.log('starting transcription stream...');
      if (window._eventSource) {
        console.log('closing existing event source');
        window._eventSource.close();
      }
      
      streamingRef.current = true;
      const eventSource = new EventSource('http://localhost:3030/sse/transcriptions');
      window._eventSource = eventSource;
      
      eventSource.onopen = () => {
        console.log('sse connection opened');
      };
      
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
            id: Date.now(),
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
        console.error("sse error:", error);
        eventSource.close();
        streamingRef.current = false;
        toast({
          title: "transcription error",
          description: "failed to stream audio. retrying...",
          variant: "destructive"
        });
        console.log('scheduling retry...');
        setTimeout(startTranscriptionScreenpipe, 1000);
      }
    } catch (error) {
      console.error("failed to start transcription:", error);
      streamingRef.current = false;
    }
  }, [toast, setChunks])

  return { 
    startTranscriptionScreenpipe, 
    stopTranscriptionScreenpipe, 
    isStreaming: streamingRef.current 
  }
} 