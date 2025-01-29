'use client'

import { Loader2, ArrowDown } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useState, useMemo } from "react"
import { TranscriptionChunk, ServiceStatus } from "./types"

interface TranscriptionViewProps {
    chunks: TranscriptionChunk[]
    isLoading: boolean
    serviceStatus: ServiceStatus
    getStatusMessage: () => string
    scrollRef: React.RefObject<HTMLDivElement>
    onScroll: () => void
    isAutoScrollEnabled: boolean
    isScrolledToBottom: boolean
}

export function TranscriptionView({
    chunks,
    isLoading,
    serviceStatus,
    getStatusMessage,
    scrollRef,
    onScroll,
    isAutoScrollEnabled,
    isScrolledToBottom
}: TranscriptionViewProps) {
    const [mergeModalOpen, setMergeModalOpen] = useState(false)
    const [nameModalOpen, setNameModalOpen] = useState(false)
    const [selectedSpeaker, setSelectedSpeaker] = useState<number | null>(null)
    const [targetSpeaker, setTargetSpeaker] = useState<number | null>(null)
    const [customSpeaker, setCustomSpeaker] = useState<string>('')
    const [speakerMappings, setSpeakerMappings] = useState<Record<number, string | number>>({})
    const [editedChunks, setEditedChunks] = useState<Record<number, string>>({})

    // moved from index.tsx
    const uniqueSpeakers = useMemo(() => {
        const speakerFirstAppearance = new Map<string | number, Date>()
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
            .filter((s): s is string | number => s !== undefined)
            .sort((a, b) => {
                const timeA = speakerFirstAppearance.get(a)?.getTime() || 0
                const timeB = speakerFirstAppearance.get(b)?.getTime() || 0
                return timeB - timeA
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

            if (prev && currentSpeaker === prevSpeaker) {
                merged[merged.length - 1] = {
                    ...prev,
                    text: `${prev.text} ${current.text}`,
                }
            } else {
                merged.push(current)
            }
        }

        return merged
    }, [chunks, speakerMappings])

    // Handler for text edits
    const handleTextEdit = (index: number, newText: string) => {
        console.log('text edited for chunk', index, ':', newText)
        setEditedChunks(prev => ({
            ...prev,
            [index]: newText
        }))
    }

    // Add color mapping function
    const getSpeakerColor = (speaker: number | string) => {
        // Using a set of accessible colors
        const colors = [
            'text-blue-600',
            'text-red-600',
            'text-green-600',
            'text-purple-600',
            'text-orange-600',
            'text-teal-600',
            'text-pink-600',
            'text-indigo-600',
        ]
        
        // Use consistent hash function for speaker to color mapping
        const hash = typeof speaker === 'number' 
            ? speaker 
            : speaker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
        
        return colors[Math.abs(hash) % colors.length]
    }

    return (
        <>
            <div
                ref={scrollRef}
                onScroll={onScroll}
                className="flex-1 overflow-y-auto bg-card"
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
                            <div key={i} className="text-sm mb-2 group relative">
                                <div className="absolute -left-1 -top-5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 px-1.5 py-0.5 rounded text-xs text-gray-500 z-10 pointer-events-none">
                                    {new Date(chunk.timestamp).toLocaleTimeString()}
                                    {chunk.speaker !== undefined && (
                                        <button
                                            onClick={() => {
                                                if (chunk.speaker !== undefined) {
                                                    setSelectedSpeaker(chunk.speaker)
                                                    setMergeModalOpen(true)
                                                }
                                            }}
                                            className={`ml-1 px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded-sm transition-colors pointer-events-auto ${
                                                chunk.speaker !== undefined ? getSpeakerColor(getDisplaySpeaker(chunk.speaker)) : ''
                                            }`}
                                        >
                                            {formatSpeaker(getDisplaySpeaker(chunk.speaker))}
                                        </button>
                                    )}
                                </div>
                                <div
                                    contentEditable
                                    suppressContentEditableWarning
                                    onBlur={(e) => handleTextEdit(i, e.currentTarget.textContent || '')}
                                    className={`outline-none focus:ring-1 focus:ring-gray-200 rounded px-1 -mx-1 ${
                                        chunk.speaker !== undefined ? getSpeakerColor(getDisplaySpeaker(chunk.speaker)) : ''
                                    }`}
                                >
                                    {editedChunks[i] ?? chunk.text}
                                </div>
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

            {/* Speaker Merge Modal */}
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
                                            setTargetSpeaker(speaker as number)
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

            {/* Speaker Name Modal */}
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