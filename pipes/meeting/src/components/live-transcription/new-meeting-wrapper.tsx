'use client'

import { useEffect, useState } from "react"
import { useTranscriptionService } from '@/components/live-transcription/use-transcription-service'
import { useAutoScroll } from '@/components/live-transcription/hooks/auto-scroll'
import { StatusAlerts } from '@/components/live-transcription/status-alerts'
import { NotesEditor } from '@/components/live-transcription/notes-editor'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Split from 'react-split'
import { TranscriptionView } from '@/components/live-transcription/transcription-view'
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { MeetingProvider } from '@/components/live-transcription/hooks/storage-for-live-meeting'
import { useSettings } from "@/lib/hooks/use-settings"
import { clearLiveMeetingData } from './hooks/storage-for-live-meeting'

interface Props {
  onBack: () => void
}

export function LiveTranscription({ onBack }: Props) {
    const {
        chunks,
        isLoadingRecent: isLoading,
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
        console.log('window height:', vh, 'header offset:', headerOffset)
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
                className="w-full"
                style={{ height: windowHeight ? `${windowHeight}px` : '100vh' }}
            >
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
                            chunks={chunks}
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