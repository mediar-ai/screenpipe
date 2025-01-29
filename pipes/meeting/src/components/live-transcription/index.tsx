'use client'

import { useEffect, useState, useMemo } from "react"
import { Loader2, ArrowDown } from "lucide-react"
import { useTranscriptionService } from './use-transcription-service'
import { useAutoScroll } from './hooks/use-auto-scroll'
import { StatusAlerts } from './status-alerts'
import { NotesEditor } from './notes-editor'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function LiveTranscription() {
  const { 
    chunks, 
    serviceStatus, 
    isLoading, 
    fetchRecentChunks, 
    checkService,
    getStatusMessage 
  } = useTranscriptionService()

  const { scrollRef, onScroll, isAutoScrollEnabled, isScrolledToBottom } = useAutoScroll(chunks)

  const [windowHeight, setWindowHeight] = useState(0)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [nameModalOpen, setNameModalOpen] = useState(false)
  const [selectedSpeaker, setSelectedSpeaker] = useState<number | null>(null)
  const [targetSpeaker, setTargetSpeaker] = useState<number | null>(null)
  const [customSpeaker, setCustomSpeaker] = useState<string>('')
  const [speakerMappings, setSpeakerMappings] = useState<Record<number, string | number>>({})

  const uniqueSpeakers = useMemo(() => {
    // Get first appearance timestamp for each speaker
    const speakerFirstAppearance = new Map<number, Date>()
    chunks.forEach(chunk => {
      if (chunk.speaker !== undefined) {
        const mappedSpeaker = speakerMappings[chunk.speaker] || chunk.speaker
        if (!speakerFirstAppearance.has(mappedSpeaker)) {
          speakerFirstAppearance.set(mappedSpeaker, new Date(chunk.timestamp))
        }
      }
    })

    return Array.from(new Set(chunks.map(chunk => {
      const speaker = chunk.speaker
      return speaker !== undefined ? speakerMappings[speaker] || speaker : undefined
    })))
    .filter((s): s is number => s !== undefined)
    .sort((a, b) => {
      const timeA = speakerFirstAppearance.get(a)?.getTime() || 0
      const timeB = speakerFirstAppearance.get(b)?.getTime() || 0
      return timeB - timeA // Reverse chronological order
    })
  }, [chunks, speakerMappings])

  const getDisplaySpeaker = (speaker: number) => {
    return speakerMappings[speaker] ?? speaker
  }

  const formatSpeaker = (speaker: string | number) => {
    return typeof speaker === 'number' ? `speaker ${speaker}` : speaker
  }

  const mergeSpeakers = (newSpeaker: string | number) => {
    if (!selectedSpeaker) return
    console.log('merging speaker', selectedSpeaker, 'into', newSpeaker)
    setSpeakerMappings(prev => ({
      ...prev,
      [selectedSpeaker]: newSpeaker,
      ...(targetSpeaker ? { [targetSpeaker]: newSpeaker } : {})
    }))
    setMergeModalOpen(false)
    setNameModalOpen(false)
    setTargetSpeaker(null)
    setCustomSpeaker('')
  }

  const mergeChunks = useMemo(() => {
    const merged: typeof chunks = []
    
    for (let i = 0; i < chunks.length; i++) {
      const current = chunks[i]
      const prev = merged[merged.length - 1]
      
      const currentSpeaker = current.speaker !== undefined ? getDisplaySpeaker(current.speaker) : undefined
      const prevSpeaker = prev?.speaker !== undefined ? getDisplaySpeaker(prev.speaker) : undefined
      
      // If previous chunk exists and has same mapped speaker, merge them
      if (prev && currentSpeaker === prevSpeaker) {
        merged[merged.length - 1] = {
          ...prev,
          text: `${prev.text} ${current.text}`,
          // Keep the original timestamp
        }
      } else {
        merged.push(current)
      }
    }
    
    return merged
  }, [chunks, speakerMappings])

  useEffect(() => {
    const init = async () => {
      await fetchRecentChunks()
      checkService()
    }
    
    init()
    const interval = setInterval(checkService, 5000)
    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

  useEffect(() => {
    const updateHeight = () => {
      // Get actual visible height
      const vh = window.innerHeight
      console.log('visible height:', vh)
      setWindowHeight(vh)
    }
    
    updateHeight()
    window.addEventListener('resize', updateHeight)
  }, [])

  const handleTimeClick = (timestamp: Date) => {
    console.log('clicking time:', timestamp)
    
    const transcriptTime = chunks.findIndex(chunk => {
      return new Date(chunk.timestamp) >= timestamp
    })
    
    console.log('found index:', transcriptTime, 'of', chunks.length)
    if (transcriptTime !== -1 && scrollRef.current) {
      const container = scrollRef.current.querySelector('.space-y-2')
      if (container && container.children[transcriptTime]) {
        container.children[transcriptTime].scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  return (
    <>
      <div 
        className="w-full flex gap-4" 
        style={{ height: windowHeight ? `calc(${windowHeight}px - 2rem)` : '100vh' }}
      >
        {/* Transcription Panel */}
        <div className="w-1/2 flex flex-col relative">
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
                {mergeChunks.map((chunk, i) => (
                  <div key={i} className="text-sm mb-2">
                    <span className="text-gray-500 text-xs">
                      {new Date(chunk.timestamp).toLocaleTimeString()} 
                      {chunk.speaker !== undefined && (
                        <button
                          onClick={() => {
                            setSelectedSpeaker(chunk.speaker)
                            setMergeModalOpen(true)
                          }}
                          className="ml-1 px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded-sm transition-colors"
                        >
                          {formatSpeaker(getDisplaySpeaker(chunk.speaker))}
                        </button>
                      )}
                    </span>
                    <div className="mt-1">{chunk.text}</div>
                  </div>
                ))}
                {serviceStatus === 'available' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent animate-pulse" />
                )}
              </div>
            )}
          </div>
          {!isAutoScrollEnabled && !isScrolledToBottom && serviceStatus === 'available' && (
            <button
              onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
              className="absolute bottom-4 right-4 p-2 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Notes Panel */}
        <div className="w-1/2">
          <NotesEditor onTimeClick={handleTimeClick} />
        </div>
      </div>

      <Dialog open={mergeModalOpen} onOpenChange={setMergeModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Rename or merge {formatSpeaker(getDisplaySpeaker(selectedSpeaker!))}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-hidden">
            <div className="flex gap-2 items-center border-b pb-4">
              <input
                type="text"
                value={customSpeaker}
                onChange={(e) => setCustomSpeaker(e.target.value)}
                placeholder="rename speaker"
                className="flex-1 px-3 py-2 text-sm border rounded-md"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customSpeaker.trim()) {
                    e.preventDefault()
                    mergeSpeakers(customSpeaker.trim())
                  }
                }}
              />
              <button
                onClick={() => mergeSpeakers(customSpeaker.trim())}
                disabled={!customSpeaker.trim()}
                className="px-3 py-2 hover:bg-gray-100 rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                rename
              </button>
            </div>

            <div className="grid gap-1 overflow-y-auto pr-2">
              <div className="text-sm text-gray-500 mb-1">or merge with:</div>
              {uniqueSpeakers
                .filter(s => s !== getDisplaySpeaker(selectedSpeaker!))
                .map(speaker => (
                  <button
                    key={speaker}
                    onClick={() => {
                      setTargetSpeaker(speaker)
                      setNameModalOpen(true)
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors text-sm"
                  >
                    {formatSpeaker(speaker)}
                  </button>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={nameModalOpen} onOpenChange={setNameModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose new name</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <button
                onClick={() => mergeSpeakers(getDisplaySpeaker(selectedSpeaker!))}
                className="text-left px-3 py-2 hover:bg-gray-100 rounded-md transition-colors text-sm"
              >
                keep {formatSpeaker(getDisplaySpeaker(selectedSpeaker!))}
              </button>
              <button
                onClick={() => mergeSpeakers(targetSpeaker!)}
                className="text-left px-3 py-2 hover:bg-gray-100 rounded-md transition-colors text-sm"
              >
                keep {formatSpeaker(targetSpeaker!)}
              </button>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={customSpeaker}
                  onChange={(e) => setCustomSpeaker(e.target.value)}
                  placeholder="enter name"
                  className="flex-1 px-3 py-2 text-sm border rounded-md"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customSpeaker.trim()) {
                      e.preventDefault()
                      mergeSpeakers(customSpeaker.trim())
                    }
                  }}
                />
                <button
                  onClick={() => mergeSpeakers(customSpeaker.trim())}
                  disabled={!customSpeaker.trim()}
                  className="px-3 py-2 hover:bg-gray-100 rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  use custom
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
} 