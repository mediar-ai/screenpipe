'use client'

import { useEffect, useState } from "react"
import { pipe } from "@screenpipe/browser"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Mic, MicOff, Settings, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface TranscriptionChunk {
  timestamp: string
  text: string
  isInput: boolean
  device: string
}

type ServiceStatus = 'available' | 'forbidden' | 'unavailable' | 'no_subscription'

export function LiveTranscription() {
  const [isRecording, setIsRecording] = useState(false)
  const [chunks, setChunks] = useState<TranscriptionChunk[]>([])
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('unavailable')
  const { toast } = useToast()

  useEffect(() => {
    const checkService = async () => {
      try {
        console.log('checking service with pipe:', {
          pipe,
          methods: Object.keys(pipe),
          input: pipe.input,
          streamTranscriptions: pipe.streamTranscriptions
        })
        
        if (!pipe?.streamTranscriptions) {
          setServiceStatus('unavailable')
          return
        }

        try {
          const testChunk = await pipe.streamTranscriptions().next()
          console.log('test transcription result:', testChunk)
          if (testChunk.value?.error?.includes('invalid subscription')) {
            setServiceStatus('no_subscription')
          } else {
            setServiceStatus('available')
          }
        } catch (error) {
          if (error instanceof Error && 
              error.message.toLowerCase().includes('invalid subscription')) {
            setServiceStatus('no_subscription')
          } else {
            setServiceStatus('available')
          }
        }
      } catch (error) {
        console.error('service check error:', {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
          pipeState: {
            initialized: !!pipe,
            hasStreamTranscriptions: !!pipe?.streamTranscriptions
          }
        })
        setServiceStatus('unavailable')
      }
    }
    
    checkService()
    const interval = setInterval(checkService, 5000)
    return () => clearInterval(interval)
  }, [])

  const getStatusMessage = () => {
    switch (serviceStatus) {
      case 'no_subscription':
        return "please subscribe to screenpipe cloud in settings"
      case 'forbidden':
        return "please enable real-time transcription in screenpipe settings"
      case 'unavailable':
        return "waiting for screenpipe to be available..."
      default:
        return "click start recording to begin transcription..."
    }
  }

  async function startTranscription() {
    if (serviceStatus !== 'available') {
      toast({
        title: "service not available",
        description: serviceStatus === 'forbidden' 
          ? "please enable real-time transcription in screenpipe settings"
          : "please make sure screenpipe is running",
        variant: "destructive"
      })
      return
    }

    setIsRecording(true)
    try {
      for await (const chunk of pipe.streamTranscriptions()) {
        console.log('new chunk:', {
          text: chunk.choices[0].text,
          metadata: chunk.metadata
        })
        
        setChunks(prev => [...prev, {
          timestamp: chunk.metadata.timestamp,
          text: chunk.choices[0].text,
          isInput: chunk.metadata.isInput,
          device: chunk.metadata.device
        }])
      }
    } catch (error) {
      console.error("transcription error:", error)
      toast({
        title: "transcription error",
        description: "failed to stream audio. please try again.",
        variant: "destructive"
      })
    } finally {
      setIsRecording(false)
    }
  }

  const stopTranscription = () => {
    setIsRecording(false)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {serviceStatus === 'no_subscription' && (
          <Alert className="mb-4 border-red-500">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-500 font-medium">
              please subscribe to screenpipe cloud in settings.
            </AlertDescription>
          </Alert>
        )}

        {serviceStatus === 'forbidden' && (
          <Alert className="mb-4 border-red-500">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-500 font-medium">
              real-time transcription is disabled. please enable it in screenpipe settings.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            live transcription
            {serviceStatus === 'unavailable' && (
              <span className="text-sm text-red-500 ml-2">
                (backend not available)
              </span>
            )}
          </h2>
          <Button 
            onClick={isRecording ? stopTranscription : startTranscription}
            variant={isRecording ? "destructive" : "default"}
            disabled={serviceStatus !== 'available'}
          >
            {isRecording ? (
              <>
                <MicOff className="h-4 w-4 mr-2" />
                stop recording
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 mr-2" />
                start recording
              </>
            )}
          </Button>
        </div>

        <div className="min-h-[200px] max-h-[600px] overflow-y-auto space-y-2">
          {chunks.length === 0 && !isRecording ? (
            <p className="text-gray-500">{getStatusMessage()}</p>
          ) : (
            chunks.map((chunk, i) => (
              <div key={i} className="text-sm">
                <span className="text-gray-500">
                  {new Date(chunk.timestamp).toLocaleTimeString()} [{chunk.isInput ? 'mic' : 'speaker'}]
                </span>
                <span className="ml-2">{chunk.text}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
} 