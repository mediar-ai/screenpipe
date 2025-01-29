import { useState } from 'react'
import { ServiceStatus } from '../types'

export function useServiceStatus() {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('unavailable')

  const checkService = async (startTranscription: () => Promise<void>) => {
    try {
      console.log('checking service availability via backend')
      
      const response = await fetch('http://localhost:3030/sse/transcriptions')
      console.log('response status:', response.status)
      
      if (!response.ok) {
        console.error('backend returned error status:', response.status)
        setServiceStatus('unavailable')
        return
      }
      
      // Since this is an SSE endpoint, we should see a text/event-stream content type
      console.log('response content-type:', response.headers.get('content-type'))
      
      const status = await response.json()
      console.log('service status response:', status)
      
      if (status.error?.includes('invalid subscription')) {
        console.log('invalid subscription detected')
        setServiceStatus('no_subscription')
      } else if (status.available) {
        console.log('service available, starting transcription')
        setServiceStatus('available')
        startTranscription()
      } else {
        console.log('service unavailable')
        setServiceStatus('unavailable')
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