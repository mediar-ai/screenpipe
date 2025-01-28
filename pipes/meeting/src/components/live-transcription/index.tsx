'use client'

import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { useTranscriptionService } from './use-transcription-service'
import { useAutoScroll } from './hooks/use-auto-scroll'
import { StatusAlerts } from './status-alerts'

export function LiveTranscription() {
  const { 
    chunks, 
    serviceStatus, 
    isLoading, 
    fetchRecentChunks, 
    checkService,
    getStatusMessage 
  } = useTranscriptionService()

  const { scrollRef, onScroll } = useAutoScroll(chunks)

  useEffect(() => {
    const init = async () => {
      await fetchRecentChunks()
      checkService()
    }
    
    init()
    const interval = setInterval(checkService, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full flex flex-col h-[calc(100vh-8rem)]">
      <StatusAlerts serviceStatus={serviceStatus} />

      <div 
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto border rounded-md bg-card"
      >
        {chunks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p>loading transcriptions...</p>
              </div>
            ) : (
              <p>{getStatusMessage()}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2 relative p-4">
            {chunks.map((chunk, i) => (
              <div key={i} className="text-sm">
                <span className="text-gray-500">
                  {new Date(chunk.timestamp).toLocaleTimeString()} 
                  [{chunk.isInput ? 'mic' : 'speaker'}]
                  {chunk.speaker !== undefined && (
                    <span className="ml-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                      speaker {chunk.speaker}
                    </span>
                  )}
                </span>
                <span className="ml-2">{chunk.text}</span>
              </div>
            ))}
            {serviceStatus === 'available' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent animate-pulse" />
            )}
          </div>
        )}
      </div>
    </div>
  )
} 