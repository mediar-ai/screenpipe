import { useState } from 'react'
import { pipe } from "@screenpipe/browser"
import { ServiceStatus } from '../types'

export function useServiceStatus() {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('unavailable')

  const checkService = async (startTranscription: () => Promise<void>) => {
    try {
      console.log('checking service availability')
      
      if (!pipe?.streamTranscriptions) {
        console.error('transcription service not available')
        setServiceStatus('unavailable')
        return
      }

      try {
        const testChunk = await pipe.streamTranscriptions().next()
        console.log('test transcription result:', testChunk)
        
        if (testChunk.value?.error?.includes('invalid subscription')) {
          console.error('invalid subscription')
          setServiceStatus('no_subscription')
        } else {
          console.log('service available, starting transcription')
          setServiceStatus('available')
          startTranscription()
        }
      } catch (error) {
        if (error instanceof Error && 
            error.message.toLowerCase().includes('invalid subscription')) {
          setServiceStatus('no_subscription')
        } else {
          setServiceStatus('available')
          startTranscription()
        }
      }
    } catch (error) {
      console.error('service check failed:', error)
      setServiceStatus('unavailable')
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