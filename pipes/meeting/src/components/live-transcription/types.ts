export interface TranscriptionChunk {
  timestamp: string
  text: string
  isInput: boolean
  device: string
  speaker?: number  // Add optional speaker field
}

export type ServiceStatus = 'available' | 'forbidden' | 'unavailable' | 'no_subscription'

export interface Note {
  id: string
  text: string
  timestamp: Date
  editedAt?: Date
  isInput: boolean
  device: string
} 