export interface TranscriptionChunk {
  timestamp: string
  text: string
  isInput: boolean
  device: string
  speaker?: number  // Add optional speaker field
}

export type ServiceStatus = 'available' | 'forbidden' | 'unavailable' | 'no_subscription' 