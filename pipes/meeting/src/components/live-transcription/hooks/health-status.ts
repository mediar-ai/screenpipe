import { useState } from 'react'
import { pipe } from "@screenpipe/browser"
import { ServiceStatus } from '../../meeting-history/types'

export function useServiceStatus() {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('unavailable')
  const [isChecking, setIsChecking] = useState(false)

  const checkService = async (startTranscription: () => Promise<void>) => {
    if (isChecking) {
      console.log('health-status: skipping check - already in progress')
      return
    }

    setIsChecking(true)
    console.log('health-status: starting service check')
    
    let testSource: EventSource | null = null
    
    try {
      testSource = new EventSource('http://localhost:3030/sse/transcriptions')
      
      const result = await Promise.race([
        new Promise<void>((resolve, reject) => {
          testSource!.onopen = () => {
            console.log('health-status: test connection opened')
          }

          testSource!.onmessage = async (event) => {
            console.log('health-status: received test message:', event.data)
            
            if (event.data === 'keep-alive-text') {
              console.log('health-status: received keep-alive, service available')
              setServiceStatus('available')
              await startTranscription()
              resolve()
              return
            }

            try {
              const chunk = JSON.parse(event.data)
              console.log('health-status: parsed test chunk:', chunk)
              
              if (chunk.error?.includes('invalid subscription') || 
                  chunk.choices?.[0]?.text?.includes('invalid subscription')) {
                console.log('health-status: invalid subscription detected')
                setServiceStatus('no_subscription')
                reject(new Error('invalid subscription'))
              } else {
                console.log('health-status: service check successful')
                setServiceStatus('available')
                await startTranscription()
                resolve()
              }
            } catch (e) {
              console.error('health-status: failed to parse chunk:', e)
              reject(e)
            }
          }

          testSource!.onerror = (error) => {
            console.error('health-status: test connection error:', error)
            setServiceStatus('unavailable')
            reject(new Error('health check failed'))
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('health check timeout')), 5000)
        )
      ])

      return result
    } catch (error) {
      console.error('health-status: service check failed:', error)
      setServiceStatus('unavailable')
    } finally {
      testSource?.close()
      setIsChecking(false)
      console.log('health-status: check completed, status:', serviceStatus)
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