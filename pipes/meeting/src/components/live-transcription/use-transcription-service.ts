import { useRecentChunks } from './hooks/pull-meetings-from-screenpipe'
import { useTranscriptionStream } from './hooks/stream-transcription-api'
import { useServiceStatus } from './hooks/health-status'
import { useEffect, useRef } from 'react'
import { getLiveMeetingData } from './hooks/storage-for-live-meeting'

export function useTranscriptionService() {
  const { chunks, setChunks, isLoading, fetchRecentChunks } = useRecentChunks()
  const { serviceStatus, checkService, getStatusMessage } = useServiceStatus()
  const { startTranscription } = useTranscriptionStream(serviceStatus, setChunks)
  const isInitialMount = useRef(true)

  useEffect(() => {
    const loadStoredChunks = async () => {
      const storedData = await getLiveMeetingData()
      if (storedData?.chunks) {
        console.log('loading stored chunks:', storedData.chunks.length)
        setChunks(storedData.chunks)
      }
    }
    loadStoredChunks()
  }, [setChunks])

  // Effect to handle service status changes and start transcription
  useEffect(() => {
    const initTranscription = async () => {
      if (isInitialMount.current) {
        isInitialMount.current = false
        console.log('initial transcription service mount')
      }

      if (serviceStatus === 'available') {
        console.log('service available, starting transcription')
        await checkService(startTranscription)
      }
    }

    initTranscription()
  }, [serviceStatus, checkService, startTranscription])

  const checkServiceAndStart = async () => {
    console.log('manually checking service and starting transcription')
    await checkService(startTranscription)
  }

  return {
    chunks,
    serviceStatus,
    isLoadingRecent: isLoading,
    fetchRecentChunks,
    checkService: checkServiceAndStart,
    getStatusMessage
  }
} 