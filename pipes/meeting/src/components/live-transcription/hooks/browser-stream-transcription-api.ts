import { useRef, useCallback } from 'react'
import { useToast } from "@/hooks/use-toast"
import { TranscriptionChunk } from '../../meeting-history/types'

export function useBrowserTranscriptionStream(
  setChunks: (updater: (prev: TranscriptionChunk[]) => TranscriptionChunk[]) => void
) {
  const streamingRef = useRef(false)
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const { toast } = useToast()

  const startTranscriptionBrowser = useCallback(async () => {
    if (streamingRef.current) {
      console.log('browser transcription already streaming')
      return
    }

    try {
      console.log('starting browser transcription stream...')
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000
        } 
      })

      // Setup WebSocket connection with diarization enabled
      const ws = new WebSocket(
        'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
          encoding: 'linear16',
          sample_rate: '16000',
          channels: '1',
          model: 'nova-2',
          smart_format: 'true',
          diarize: 'true', // Enable speaker diarization
          interim_results: 'false',
          punctuate: 'true'
        }), 
        ['token', process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY as string]
      )

      // Setup audio processing
      const audioContext = new AudioContext({ sampleRate: 16000 })
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(2048, 1, 1)
      
      source.connect(processor)
      processor.connect(audioContext.destination)

      ws.onopen = () => {
        console.log('deepgram websocket opened')
        streamingRef.current = true
        
        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0)
            const pcmData = convertFloat32ToInt16(inputData)
            ws.send(pcmData.buffer)
          }
        }
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'Results') {
          const words = data.channel.alternatives[0].words || []
          if (data.is_final && words.length > 0) {
            console.log('new browser transcription:', {
              text: data.channel.alternatives[0].transcript,
              words: words
            })
            
            const chunk: TranscriptionChunk = {
              id: Date.now(),
              timestamp: new Date().toISOString(),
              text: data.channel.alternatives[0].transcript,
              isInput: true,
              device: 'browser',
              speaker: `speaker_${words[0].speaker || 0}` // Use first word's speaker ID
            }
            
            setChunks(prev => [...prev, chunk])
          }
        }
      }

      ws.onerror = (error) => {
        console.error('deepgram websocket error:', error)
      }

      ws.onclose = () => {
        console.log('deepgram websocket closed')
        streamingRef.current = false
      }

      socketRef.current = ws
      audioContextRef.current = audioContext

    } catch (error) {
      console.error("failed to start browser transcription:", error)
      streamingRef.current = false
      toast({
        title: "transcription error",
        description: "failed to start browser transcription",
        variant: "destructive"
      })
    }
  }, [toast, setChunks])

  const stopTranscriptionBrowser = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'CloseStream' }))
      socketRef.current.close()
      socketRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    streamingRef.current = false
    console.log('browser transcription stopped')
  }, [])

  return { startTranscriptionBrowser, stopTranscriptionBrowser }
}

function convertFloat32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16Array
}
