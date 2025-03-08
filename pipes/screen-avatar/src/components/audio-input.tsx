"use client"

import { Button } from '@/components/ui/button'
import { Mic, MicOff, Play, Square } from 'lucide-react'
import { useState } from 'react'

interface AudioInputProps {
  disabled: boolean
  isListening?: boolean
  onStartListening?: () => void
  onStopListening?: () => void
}

export function AudioInput({ 
  disabled, 
  isListening = false,
  onStartListening,
  onStopListening
}: AudioInputProps) {
  return (
    <Button
      onClick={isListening ? onStopListening : onStartListening}
      disabled={disabled}
      variant={isListening ? "destructive" : "secondary"}
    >
      {isListening ? (
        <Square className="h-4 w-4" />
      ) : (
        <Play className="h-4 w-4" />
      )}
      {isListening ? 'Stop' : 'Start'} Voice
    </Button>
  )
} 