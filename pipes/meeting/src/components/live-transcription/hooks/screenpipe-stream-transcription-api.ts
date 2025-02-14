import { useRef, useCallback } from 'react'
import { pipe } from "@screenpipe/browser"
import { useToast } from "@/hooks/use-toast"
import { TranscriptionChunk } from '../../meeting-history/types'
import { useSettings } from '@/lib/hooks/use-settings'

declare global {
  interface Window {
    _eventSource?: WebSocket;
  }
}

export function useTranscriptionStream(
  setChunks: (updater: (prev: TranscriptionChunk[]) => TranscriptionChunk[]) => void
) {
  const streamingRef = useRef(false)
  const { toast } = useToast()
  const { settings } = useSettings()

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
        console.log('closing existing websocket');
        window._eventSource.close();
      }
      
      streamingRef.current = true;

      // Use WebSocket URL from settings
      const wsUrl = settings.aiUrl.replace('https://', 'wss://');
      const ws = new WebSocket(`${wsUrl}/listen?sample_rate=16000&smart_format=true&diarize=true`);
      
      // Add auth header using settings token
      if (settings.user?.token) {
        ws.onopen = () => {
          console.log('websocket connection opened, sending auth token');
          ws.send(JSON.stringify({
            type: 'auth',
            token: settings.user.token
          }));
        };
      }

      window._eventSource = ws;
      
      let currentChunk: TranscriptionChunk | null = null;
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('new transcription:', data);
        
        if (!data.channel?.alternatives?.[0]) return;
        
        const transcript = data.channel.alternatives[0];
        const speaker = transcript.words?.[0]?.speaker ?? 'unknown';
        
        // If same speaker, append text with typing effect
        if (currentChunk && currentChunk.speaker === `speaker_${speaker}`) {
          const words = transcript.transcript.split(' ');
          let wordIndex = 0;
          
          const typeWords = () => {
            if (wordIndex < words.length) {
              currentChunk!.text += (currentChunk!.text ? ' ' : '') + words[wordIndex];
              setChunks(prev => [...prev.slice(0, -1), { ...currentChunk! }]);
              wordIndex++;
              setTimeout(typeWords, 20);
            }
          }
          
          typeWords();
        } else {
          // New speaker or first chunk
          currentChunk = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            text: transcript.transcript,
            isInput: true,
            device: 'microphone',
            speaker: `speaker_${speaker}`
          };
          setChunks(prev => [...prev, currentChunk!]);
        }
      };

      ws.onerror = (error) => {
        console.error("websocket error:", error);
        ws.close();
        streamingRef.current = false;
        toast({
          title: "transcription error",
          description: "failed to stream audio. retrying...",
          variant: "destructive"
        });
        setTimeout(startTranscriptionScreenpipe, 1000);
      };

    } catch (error) {
      console.error("failed to start transcription:", error);
      streamingRef.current = false;
    }
  }, [toast, setChunks, settings]);

  return { 
    startTranscriptionScreenpipe, 
    stopTranscriptionScreenpipe, 
    isStreaming: streamingRef.current 
  }
} 