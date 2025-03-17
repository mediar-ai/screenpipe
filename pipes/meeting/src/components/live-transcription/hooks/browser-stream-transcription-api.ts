import { useRef, useCallback } from 'react'
import { useToast } from "@/hooks/use-toast"
import { TranscriptionChunk } from '../../meeting-history/types'

export function useBrowserTranscriptionStream(
  onNewChunk: (chunk: TranscriptionChunk) => void
) {
  const streamingRef = useRef(false)
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const intentionalCloseRef = useRef(false)
  const { toast } = useToast()

  const startTranscriptionBrowser = useCallback(async () => {
    if (streamingRef.current) {
      console.log('browser transcription already streaming')
      return
    }

    intentionalCloseRef.current = false
    // Use env var with fallback to hardcoded key, move to back
    const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY || '646b887eceffbf128315d2f419e48a2ff174ab66'
    // console.log('using deepgram api key:', apiKey ? 'found' : 'not found')

    try {
      console.log('starting browser transcription stream...')
      // console.log('requesting user media...')
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000
        } 
      })
      mediaStreamRef.current = stream
      // console.log('got media stream:', { tracks: stream.getTracks().length })

      // console.log('initializing websocket connection to deepgram...')
      // Setup WebSocket connection with diarization enabled
      const ws = new WebSocket(
        'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
          encoding: 'linear16',
          sample_rate: '16000',
          channels: '1',
          model: 'nova-3',
          smart_format: 'true',
          diarize: 'true',
          interim_results: 'false',
          punctuate: 'true'
        }), 
        ['token', apiKey]
      )
      // console.log('websocket created, waiting for open...')

      // Setup audio processing
      // console.log('setting up audio context...')
      const audioContext = new AudioContext({ sampleRate: 16000 })
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(2048, 1, 1)
      // console.log('audio context state:', audioContext.state)
      
      source.connect(processor)
      processor.connect(audioContext.destination)
      // console.log('audio processing chain connected')

      ws.onopen = () => {
        // console.log('deepgram websocket opened')
        streamingRef.current = true
        
        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0)
            const pcmData = convertFloat32ToInt16(inputData)
            ws.send(pcmData.buffer)
          }
        }
        // console.log('audio processor handler attached')
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)

        if (data.type === 'Results') {
          const words = data.channel.alternatives[0].words || []
          if (data.is_final && words.length > 0) {
            const chunk: TranscriptionChunk = {
              id: Date.now(),
              timestamp: new Date().toISOString(),
              text: data.channel.alternatives[0].transcript,
              isInput: true,
              device: 'browser',
              speaker: `speaker_${words[0].speaker || 0}`
            }
            
            // console.log('transcription:', { speaker: chunk.speaker, text: chunk.text })
            onNewChunk(chunk)
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
          wasClean: event.wasClean,
          intentional: intentionalCloseRef.current
        })
        streamingRef.current = false
        
        // Only attempt reconnection if not intentionally closed
        if (!intentionalCloseRef.current && event.code !== 1000) {
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
  }, [toast, onNewChunk])

  const stopTranscriptionBrowser = useCallback(() => {
    console.log('stopping browser transcription...')
    intentionalCloseRef.current = true
    
    // Close websocket
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'CloseStream' }))
      socketRef.current.close()
      socketRef.current = null
    }

    // Stop all media tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop()
      })
      mediaStreamRef.current = null
    }

    // Close audio context
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
