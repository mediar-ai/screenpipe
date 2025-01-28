import { useRecentChunks } from './hooks/use-recent-chunks'
import { useTranscriptionStream } from './hooks/use-transcription-stream'
import { useServiceStatus } from './hooks/use-service-status'

export function useTranscriptionService() {
  const { chunks, setChunks, isLoading, fetchRecentChunks } = useRecentChunks()
  const { serviceStatus, checkService, getStatusMessage } = useServiceStatus()
  const { startTranscription } = useTranscriptionStream(serviceStatus, setChunks)

  const checkServiceAndStart = async () => {
    await checkService(startTranscription)
  }

  return {
    chunks,
    serviceStatus,
    isLoading,
    fetchRecentChunks,
    checkService: checkServiceAndStart,
    getStatusMessage
  }
} 