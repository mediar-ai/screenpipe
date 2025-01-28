export interface TranscriptionChunk {
  timestamp: string
  text: string
  isInput: boolean
  device: string
  speaker?: number  // Optional because some chunks might not have speaker info
}

export type ServiceStatus = 'available' | 'forbidden' | 'unavailable' | 'no_subscription' 