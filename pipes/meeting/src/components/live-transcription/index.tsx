'use client'

import { useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
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
    <Card>
      <CardContent className="pt-6">
        <StatusAlerts serviceStatus={serviceStatus} />

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            live transcription
            {serviceStatus === 'unavailable' && (
              <span className="text-sm text-red-500 ml-2">
                (backend not available)
              </span>
            )}
          </h2>
        </div>

        <div 
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-[200px] max-h-[600px] overflow-y-auto space-y-2"
        >
          {chunks.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-gray-500">
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
            <div className="space-y-2 relative">
              {chunks.map((chunk, i) => (
                <div key={i} className="text-sm">
                  <span className="text-gray-500">
                    {new Date(chunk.timestamp).toLocaleTimeString()} [{chunk.isInput ? 'mic' : 'speaker'}]
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
      </CardContent>
    </Card>
  )
} 