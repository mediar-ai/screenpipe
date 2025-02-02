import { useRecentChunks } from './hooks/pull-meetings-from-screenpipe'
import { useTranscriptionStream } from './hooks/screenpipe-stream-transcription-api'
import { useServiceStatus } from './hooks/health-status'
import { useEffect, useRef } from 'react'
import { getLiveMeetingData } from './hooks/storage-for-live-meeting'

export function useTranscriptionService() {
  const { chunks, setChunks, isLoading, fetchRecentChunks } = useRecentChunks()
  const { serviceStatus, getStatusMessage } = useServiceStatus()
  // const { serviceStatus, checkService, getStatusMessage } = useServiceStatus()
  const { startTranscription } = useTranscriptionStream(serviceStatus, setChunks)
  const initRef = useRef(false)
  // const checkingRef = useRef(false)

  // Load stored chunks and start transcription
  useEffect(() => {
    const init = async () => {
      if (initRef.current) return
      initRef.current = true
      
      const storedData = await getLiveMeetingData()
      if (storedData?.chunks) {
        console.log('transcription-service: loading stored chunks:', storedData.chunks.length)
        setChunks(storedData.chunks)
      }

      console.log('transcription-service: starting transcription')
      await startTranscription()
    }
    init()
  }, [setChunks, startTranscription])

  // Health check effect commented out for now
  /*
  useEffect(() => {
    console.log('transcription-service: setting up health checks')
    let isActive = true
    
    const runHealthCheck = async () => {
      if (checkingRef.current || !isActive) return
      checkingRef.current = true
      
      try {
        console.log('transcription-service: running health check')
        await checkService(startTranscription)
      } catch (e) {
        console.error('transcription-service: health check failed:', e)
      } finally {
        checkingRef.current = false
      }
    }

    // Initial check
    runHealthCheck()

    // Set up interval for subsequent checks if not available
    const interval = setInterval(() => {
      if (serviceStatus !== 'available') {
        runHealthCheck()
      }
    }, 5000)

    return () => {
      console.log('transcription-service: cleaning up health checks')
      isActive = false
      clearInterval(interval)
    }
  }, [checkService, startTranscription, serviceStatus])
  */

  return {
    chunks,
    serviceStatus,
    isLoadingRecent: isLoading,
    fetchRecentChunks,
    getStatusMessage
  }
} 