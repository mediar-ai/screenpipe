'use client'

import { useEffect, useState } from "react"
import { useTranscriptionService } from '@/components/live-transcription/use-transcription-service'
import { useAutoScroll } from '@/components/live-transcription/hooks/auto-scroll'
import { StatusAlerts } from '@/components/live-transcription/status-alerts'
import { NotesEditor } from '@/components/live-transcription/notes-editor'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Split from 'react-split'
import { TranscriptionView } from '@/components/live-transcription/transcription-view'
import { ArrowLeft, Mic, MicOff, Square, Play } from "lucide-react"
import { useRouter } from "next/navigation"
import { MeetingProvider } from '@/components/live-transcription/hooks/storage-for-live-meeting'
import { useSettings } from "@/lib/hooks/use-settings"
import { clearLiveMeetingData } from './hooks/storage-for-live-meeting'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface Props {
  onBack: () => void
}

export function LiveTranscription({ onBack }: Props) {
    const {
        chunks,
        isLoadingRecent: isLoading,
        isRecording,
        toggleRecording
    } = useTranscriptionService()

    const { scrollRef, onScroll, isScrolledToBottom } = useAutoScroll(chunks)
    const [windowHeight, setWindowHeight] = useState(0)
    const [mergeModalOpen, setMergeModalOpen] = useState(false)
    const [sizes, setSizes] = useState([50, 50])
    const router = useRouter()
    const { settings } = useSettings()

    const updateHeight = () => {
        const vh = window.innerHeight
        const headerOffset = 32
        setWindowHeight(vh - headerOffset)
    }

    // Window resize handler
    useEffect(() => {
        updateHeight()
        window.addEventListener('resize', updateHeight)
        return () => window.removeEventListener('resize', updateHeight)
    }, []) // Empty deps array since updateHeight is stable

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

    const onDragEnd = (newSizes: number[]) => {
        setSizes(newSizes)
    }

    const onDrag = (newSizes: number[]) => {
        // Auto collapse while dragging
        if (newSizes[0] < 25) setSizes([0, 100])
        if (newSizes[1] < 25) setSizes([100, 0])
    }

    const handleBack = () => {
        console.log('navigating back to meeting history')
        router.push('/meetings')
    }

    return (
        <div className="h-full flex flex-col">
            <div
                className="w-full relative"
                style={{ height: windowHeight ? `${windowHeight}px` : '100vh' }}
            >
                {/* Update recording toggle button with tooltip */}
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleRecording}
                                className="absolute right-7 z-20 hover:bg-gray-100/80 transition-colors"
                                title={isRecording ? "stop recording" : "start recording"}
                            >
                                {isRecording ? (
                                    <Square className="h-4 w-4 text-red-500 fill-red-500" />
                                ) : (
                                    <Play className="h-4 w-4 text-green-500 fill-green-500" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            {isRecording ? (
                                <span>stop recording transcription</span>
                            ) : (
                                <span>start recording transcription</span>
                            )}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <Split
                    className="flex gap-0 h-full [&_.gutter]:bg-gray-100 [&_.gutter]:bg-dotted [&_.gutter]:w-[3px] [&_.gutter]:mx-1 [&_.gutter]:cursor-col-resize"
                    sizes={sizes}
                    minSize={0}
                    snapOffset={100}
                    onDragEnd={onDragEnd}
                    onDrag={onDrag}
                >
                    {/* Transcription Panel */}
                    <div className="flex flex-col relative">
                        <TranscriptionView
                            settings={settings}
                            isLoading={isLoading}
                            isAutoScrollEnabled={isScrolledToBottom}
                            scrollRef={scrollRef}
                            onScroll={onScroll}
                            isScrolledToBottom={isScrolledToBottom}
                        />
                    </div>

                    {/* Notes Panel */}
                    <div>
                        <NotesEditor 
                            onTimeClick={handleTimeClick} 
                            onBack={handleBack}
                            onNewMeeting={() => {
                                clearLiveMeetingData()
                                router.refresh()
                            }}
                        />
                    </div>
                </Split>

                <Dialog open={mergeModalOpen} onOpenChange={setMergeModalOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Merge Speakers</DialogTitle>
                        </DialogHeader>
                        {/* Dialog content */}
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
} 