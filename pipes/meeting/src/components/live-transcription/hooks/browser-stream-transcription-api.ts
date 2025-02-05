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

    // Use env var with fallback to hardcoded key
    const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY || '646b887eceffbf128315d2f419e48a2ff174ab66'
    console.log('using deepgram api key:', apiKey ? 'found' : 'not found')

    try {
      console.log('starting browser transcription stream...')
      console.log('requesting user media...')
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000
        } 
      })
      console.log('got media stream:', { tracks: stream.getTracks().length })

      console.log('initializing websocket connection to deepgram...')
      // Setup WebSocket connection with diarization enabled
      const ws = new WebSocket(
        'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
          encoding: 'linear16',
          sample_rate: '16000',
          channels: '1',
          model: 'nova-2',
          smart_format: 'true',
          diarize: 'true',
          interim_results: 'false',
          punctuate: 'true'
        }), 
        ['token', apiKey]
      )
      console.log('websocket created, waiting for open...')

      // Setup audio processing
      console.log('setting up audio context...')
      const audioContext = new AudioContext({ sampleRate: 16000 })
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(2048, 1, 1)
      console.log('audio context state:', audioContext.state)
      
      source.connect(processor)
      processor.connect(audioContext.destination)
      console.log('audio processing chain connected')

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
        console.log('audio processor handler attached')
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        console.log('received websocket message:', data.type)
        if (data.type === 'Results') {
          const words = data.channel.alternatives[0].words || []
          if (data.is_final && words.length > 0) {
            console.log('new browser transcription:', {
              text: data.channel.alternatives[0].transcript,
              speaker: `speaker_${words[0].speaker || 0}`,
              words: words
            })
            
            const chunk: TranscriptionChunk = {
              id: Date.now(),
              timestamp: new Date().toISOString(),
              text: data.channel.alternatives[0].transcript,
              isInput: true,
              device: 'browser',
              speaker: `speaker_${words[0].speaker || 0}`
            }
            
            setChunks(prev => [...prev, chunk])
          }
        }
      }

      ws.onerror = (error) => {
        console.error('deepgram websocket error:', error)
        // Add more detailed error info
        const errorDetails = error instanceof ErrorEvent ? error.message : 'unknown error'
        toast({
          title: "websocket error",
          description: `connection failed: ${errorDetails}`,
          variant: "destructive"
        })
        // Cleanup on error
        stopTranscriptionBrowser()
      }

      ws.onclose = (event) => {
        console.log('deepgram websocket closed', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        })
        streamingRef.current = false
        // Attempt reconnection if not intentionally closed
        if (event.code !== 1000) {
          console.log('attempting to reconnect...')
          setTimeout(startTranscriptionBrowser, 2000)
        }
      }

      socketRef.current = ws
      audioContextRef.current = audioContext

    } catch (error) {
      console.error("failed to start browser transcription:", error)
      streamingRef.current = false
      toast({
        title: "transcription error",
        description: `failed to start browser transcription: ${error}`,
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
