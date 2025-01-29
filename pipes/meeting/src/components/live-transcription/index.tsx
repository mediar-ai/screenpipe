'use client'

import { useEffect, useState } from "react"
import { useTranscriptionService } from './use-transcription-service'
import { useAutoScroll } from './hooks/use-auto-scroll'
import { StatusAlerts } from './status-alerts'
import { NotesEditor } from './notes-editor'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Split from 'react-split'
import { TranscriptionView } from './transcription-view'

export function LiveTranscription() {
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
        const interval = setInterval(checkService, 5000)
        return () => {
            clearInterval(interval)
            window.removeEventListener('resize', updateHeight)
        }
    }, [])

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
                        isLoading={isLoading}
                        isAutoScrollEnabled={true}
                        serviceStatus={serviceStatus}
                        getStatusMessage={getStatusMessage}
                        scrollRef={scrollRef}
                        onScroll={onScroll}
                        isScrolledToBottom={isScrolledToBottom}
                    />
                </div>

                {/* Notes Panel */}
                <div>
                    <NotesEditor onTimeClick={handleTimeClick} />
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
    )
} 