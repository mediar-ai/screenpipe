import { useRecentChunks } from './hooks/pull-meetings-from-screenpipe'
import { useTranscriptionStream } from './hooks/screenpipe-stream-transcription-api'
import { useDeepgramTranscription } from './hooks/deepgram-rtt'
import { useAudioStream } from './hooks/chrome-audio-stream'
import { useServiceStatus } from './hooks/health-status'
import { useEffect, useRef } from 'react'
import { getLiveMeetingData } from './hooks/storage-for-live-meeting'

type TranscriptionMode = 'local' | 'remote'

export function useTranscriptionService(mode: TranscriptionMode = 'remote') {
  const { chunks, setChunks, isLoading, fetchRecentChunks } = useRecentChunks()
  const { serviceStatus, getStatusMessage } = useServiceStatus()
  // const { serviceStatus, checkService, getStatusMessage } = useServiceStatus()
  const { startTranscription } = useTranscriptionStream(serviceStatus, setChunks)
  const initRef = useRef(false)
  // const checkingRef = useRef(false)

  // local transcription state
  const { stream, startRecording, stopRecording } = useAudioStream()
  const { transcript, error: transcriptError } = useDeepgramTranscription(stream)

  // handle local transcription chunks
  useEffect(() => {
    if (mode === 'local' && transcript) {
      const newChunk = {
        id: Date.now().toString(),
        text: transcript,
        timestamp: new Date().toISOString(),
        // add other required chunk fields
      }
      setChunks(prev => [...prev, newChunk])
    }
  }, [mode, transcript, setChunks])

  // Load stored chunks and start appropriate transcription
  useEffect(() => {
    const init = async () => {
      if (initRef.current) return
      initRef.current = true
      
      const storedData = await getLiveMeetingData()
      if (storedData?.chunks) {
        console.log('transcription-service: loading stored chunks:', storedData.chunks.length)
        setChunks(storedData.chunks)
      }

      if (mode === 'remote') {
        console.log('transcription-service: starting remote transcription')
        await startTranscription()
      } else {
        console.log('transcription-service: starting local transcription')
        await startRecording()
      }
    }
    init()

    // cleanup
    return () => {
      if (mode === 'local') {
        stopRecording()
      }
    }
  }, [mode, setChunks, startTranscription, startRecording, stopRecording])

  return {
    chunks,
    serviceStatus: mode === 'remote' ? serviceStatus : 'available',
    isLoadingRecent: isLoading,
    fetchRecentChunks,
    getStatusMessage,
    transcriptError: mode === 'local' ? transcriptError : undefined
  }
} 