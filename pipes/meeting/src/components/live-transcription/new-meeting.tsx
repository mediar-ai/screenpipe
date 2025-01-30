'use client'

import { useEffect, useState } from "react"
import { useTranscriptionService } from './use-transcription-service'
import { useAutoScroll } from './hooks/use-auto-scroll'
import { StatusAlerts } from './status-alerts'
import { NotesEditor } from './notes-editor'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Split from 'react-split'
import { TranscriptionView } from './transcription-view'
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { MeetingProvider } from './hooks/use-meeting-context'
import { useSettings } from "@/lib/hooks/use-settings"

interface LiveTranscriptionProps {
    onBack: () => void;
}

export function LiveTranscription({ onBack }: LiveTranscriptionProps) {
    const {
        chunks,
        serviceStatus,
        isLoadingRecent: isLoading,
        fetchRecentChunks,
        checkService,
        getStatusMessage
    } = useTranscriptionService()

    const { scrollRef, onScroll, isScrolledToBottom } = useAutoScroll(chunks)

    const [windowHeight, setWindowHeight] = useState(0)
    const [mergeModalOpen, setMergeModalOpen] = useState(false)
    const [sizes, setSizes] = useState([50, 50])

    const router = useRouter()

    const { settings } = useSettings()

    const updateHeight = () => {
        const vh = window.innerHeight
        const headerOffset = 32 // 2rem
        console.log('window height:', vh, 'header offset:', headerOffset)
        setWindowHeight(vh - headerOffset)
    }

    useEffect(() => {
        const init = async () => {
            await fetchRecentChunks()
            checkService()
        }

        init()
        
        // Only set interval if service is not available
        let interval: NodeJS.Timeout | undefined
        if (serviceStatus !== 'available') {
            console.log('setting up service check interval')
            interval = setInterval(checkService, 5000)
        }

        return () => {
            if (interval) clearInterval(interval)
            window.removeEventListener('resize', updateHeight)
        }
    }, [serviceStatus])

    useEffect(() => {
        updateHeight()
        window.addEventListener('resize', updateHeight)
        return () => window.removeEventListener('resize', updateHeight)
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

    return (
        <MeetingProvider>
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
                            <StatusAlerts serviceStatus={serviceStatus} />
                            <TranscriptionView
                                chunks={chunks}
                                settings={settings}
                                isLoading={isLoading}
                                isAutoScrollEnabled={isScrolledToBottom}
                                serviceStatus={serviceStatus}
                                getStatusMessage={getStatusMessage}
                                scrollRef={scrollRef}
                                onScroll={onScroll}
                                isScrolledToBottom={isScrolledToBottom}
                            />
                        </div>

                        {/* Notes Panel */}
                        <div>
                            <NotesEditor onTimeClick={handleTimeClick} onBack={onBack} />
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
        </MeetingProvider>
    )
} 