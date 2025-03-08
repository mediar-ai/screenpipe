import { env } from '@/env.mjs'

interface VoiceSettings {
  stability: number
  similarity_boost: number
}

interface GenerationConfig {
  chunk_length_schedule: number[]
}

interface WebSocketMessage {
  text: string
  voice_settings?: VoiceSettings
  generation_config?: GenerationConfig
  xi_api_key?: string
  flush?: boolean
}

interface AlignmentInfo {
  charStartTimesMs: number[]
  charDurationsMs: number[]
  chars: string[]
}

interface WebSocketResponse {
  audio: string // base64 encoded audio
  isFinal: boolean
  normalizedAlignment: AlignmentInfo
  alignment: AlignmentInfo
  error?: string
}

export class ElevenLabsWebSocket {
  private ws: WebSocket | null = null
  private voiceId: string
  private modelId: string
  private onAudioCallback: ((audio: Uint8Array) => void) | null = null
  private onFinishCallback: (() => void) | null = null
  private onErrorCallback: ((error: Error) => void) | null = null
  private isConnected: boolean = false
  private messageQueue: string[] = []

  constructor(voiceId: string = 'bMxLr8fP6hzNRRi9nJxU', modelId = 'eleven_flash_v2_5') {
    if (!voiceId) {
      throw new Error('voice id is required') 
    }
    console.log('initializing elevenlabs websocket with voice:', voiceId)
    this.voiceId = voiceId
    this.modelId = modelId
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') return reject(new Error('window not defined'))
      if (this.isConnected) return resolve()

      const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=${this.modelId}`
      console.log('connecting to elevenlabs websocket:', url)
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('connected to elevenlabs websocket') 
        this.isConnected = true
        // Send BOS with required settings
        this.sendMessage({
          text: " ", // Must be a single space for BOS
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
          },
          generation_config: {
            chunk_length_schedule: [120, 160, 250, 290]
          },
          xi_api_key: env.NEXT_PUBLIC_ELEVENLABS_API_KEY,
        })
        resolve()
      }

      this.ws.onmessage = (event) => {
        try {
          const response: WebSocketResponse = JSON.parse(event.data)
          
          if (response.error) {
            console.error('websocket error:', response.error)
            this.onErrorCallback?.(new Error(response.error))
            return
          }
          
          if (response.audio) {
            const audioData = Uint8Array.from(atob(response.audio), c => c.charCodeAt(0))
            this.onAudioCallback?.(audioData)
          }

          if (response.isFinal) {
            console.log('received final message')
            this.onFinishCallback?.()
          }
        } catch (error) {
          console.error('error processing websocket message:', error)
          this.onErrorCallback?.(error as Error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('websocket error:', error)
        this.isConnected = false
        this.onErrorCallback?.(new Error('websocket error'))
        reject(error)
      }

      this.ws.onclose = () => {
        console.log('websocket closed')
        this.isConnected = false
      }
    })
  }

  async sendText(text: string) {
    if (!this.isConnected) {
      await this.connect()
    }
    console.log('sending text message:', text)
    
    // Split text into smaller chunks and send rapidly
    const chunks = text.split(' ')
    for (const chunk of chunks) {
      this.sendMessage({ text: chunk + ' ' })
    }
    
    // Send flush command to force generation
    this.sendMessage({ text: ' ', flush: true })
  }

  private sendMessage(message: WebSocketMessage) {
    if (!this.ws || !this.isConnected) {
      throw new Error('websocket not connected')
    }
    this.ws.send(JSON.stringify(message))
  }

  close() {
    if (this.ws) {
      console.log('closing websocket connection')
      // Send EOS message
      this.sendMessage({ text: '' })
      this.ws.close()
      this.ws = null
      this.isConnected = false
    }
  }

  onAudio(callback: (audio: Uint8Array) => void) {
    this.onAudioCallback = callback
  }

  onFinish(callback: () => void) {
    this.onFinishCallback = callback
  }

  onError(callback: (error: Error) => void) {
    this.onErrorCallback = callback
  }

  isConnected(): boolean {
    return this.isConnected
  }
}
