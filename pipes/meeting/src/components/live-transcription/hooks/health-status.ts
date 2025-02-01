import { useState } from 'react'
import { pipe } from "@screenpipe/browser"
import { ServiceStatus } from '../types'

export function useServiceStatus() {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('unavailable')
  const [isChecking, setIsChecking] = useState(false)

  const checkService = async (startTranscription: () => Promise<void>) => {
    if (isChecking || serviceStatus === 'available') {
      console.log('skipping service check - already checking or available')
      return
    }

    setIsChecking(true)
    try {
      console.log('checking service availability, pipe exists:', !!pipe, 'streamTranscriptions exists:', !!pipe?.streamTranscriptions)
      
      if (!pipe?.streamTranscriptions) {
        console.error('transcription service not available - pipe:', pipe)
        setServiceStatus('unavailable')
        return
      }

      try {
        console.log('attempting to get test transcription chunk')
        const testChunk = await pipe.streamTranscriptions().next()
        console.log('test transcription result:', testChunk, 'value:', testChunk.value)
        
        if ((testChunk.value as { error?: { message: string } })?.error?.message?.includes('invalid subscription')) {
          console.error('invalid subscription detected')
          setServiceStatus('no_subscription')
        } else {
          console.log('service available, starting transcription')
          setServiceStatus('available')
          startTranscription()
        }
      } catch (error) {
        if (error instanceof Error && 
            error.message.toLowerCase().includes('invalid subscription')) {
          console.log('caught invalid subscription error')
          setServiceStatus('no_subscription')
        } else {
          console.log('no error detected, starting transcription')
          setServiceStatus('available')
          startTranscription()
        }
      }
    } catch (error) {
      console.error('service check failed:', error)
      setServiceStatus('unavailable')
    } finally {
      setIsChecking(false)
    }
  }

  const getStatusMessage = () => {
    switch (serviceStatus) {
      case 'no_subscription':
        return "please subscribe to screenpipe cloud in settings"
      case 'forbidden':
        return "please enable real-time transcription in screenpipe settings"
      case 'unavailable':
        return "waiting for screenpipe to be available..."
      default:
        return "transcribing..."
    }
  }

  return { serviceStatus, checkService, getStatusMessage }
} 