export interface TranscriptionChunk {
  timestamp: string
  text: string
  isInput: boolean
  device: string
}

export type ServiceStatus = 'available' | 'forbidden' | 'unavailable' | 'no_subscription' 