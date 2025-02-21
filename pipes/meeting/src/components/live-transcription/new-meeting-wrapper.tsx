'use client'

import { useEffect, useState } from "react"
import { useTranscriptionService } from '@/components/live-transcription/use-transcription-service'
import { useAutoScroll } from '@/components/live-transcription/hooks/auto-scroll'
import { StatusAlerts } from '@/components/live-transcription/status-alerts'
import { NotesEditor } from '@/components/live-transcription/notes-editor'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Split from 'react-split'
import { TranscriptionView } from '@/components/live-transcription/transcription-view'
import { Square, Play } from "lucide-react"
import { useRouter } from "next/navigation"
import { MeetingProvider, useMeetingContext, archiveLiveMeeting, LiveMeetingData } from '@/components/live-transcription/hooks/storage-for-live-meeting'
import { useSettings } from "@/lib/hooks/use-settings"
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/hooks/use-toast"
import { handleStartNewMeeting } from '@/components/meeting-history/meeting-utils'
import { cn } from "@/lib/utils"


export function LiveTranscription() {
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
    const { data, updateStore, reloadData } = useMeetingContext()

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

    useEffect(() => {
        console.log('live transcription component mounted')
        return () => console.log('live transcription component unmounted')
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

    const onDragEnd = (newSizes: number[]) => {
        setSizes(newSizes)
    }

    const onDrag = (newSizes: number[]) => {
        // Auto collapse while dragging
        if (newSizes[0] < 25) setSizes([0, 100])
        if (newSizes[1] < 25) setSizes([100, 0])
    }

    const handleNewMeeting = async () => {
        await handleStartNewMeeting(data)
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
                                onClick={() => toggleRecording()}
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

                {/* Mobile-first approach: vertical on mobile, horizontal on desktop */}
                <Split
                    className={cn(
                        "flex h-full",
                        // Base mobile styles
                        "flex-col [&_.gutter]:h-[3px] [&_.gutter]:my-1 [&_.gutter]:cursor-row-resize",
                        // Desktop styles (md and up)
                        "md:flex-row md:[&_.gutter]:w-[3px] md:[&_.gutter]:mx-1 md:[&_.gutter]:cursor-col-resize",
                        "[&_.gutter]:bg-gray-100 [&_.gutter]:bg-dotted"
                    )}
                    sizes={sizes}
                    minSize={0}
                    snapOffset={100}
                    onDragEnd={onDragEnd}
                    onDrag={onDrag}
                    direction={typeof window !== 'undefined' && window.innerWidth >= 768 ? 'horizontal' : 'vertical'}
                >
                    {/* Transcription Panel */}
                    <div className="h-full overflow-hidden">
                        <TranscriptionView
                            settings={settings}
                            isLoading={isLoading}
                        />
                    </div>

                    {/* Notes Panel */}
                    <div className="h-full overflow-hidden">
                        <NotesEditor 
                            onTimeClick={handleTimeClick} 
                            onNewMeeting={handleNewMeeting}
                            isRecording={isRecording}
                            onToggleRecording={toggleRecording}
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