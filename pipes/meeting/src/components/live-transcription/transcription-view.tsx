'use client'

import { Loader2, ArrowDown, LayoutList, Layout } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { TranscriptionChunk, ServiceStatus } from "../meeting-history/types"
import { ChunkOverlay } from "./floating-container-buttons"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { addVocabularyEntry } from './hooks/storage-vocabulary'
import { generateMeetingNote } from './hooks/ai-create-note-based-on-chunk'
import { useMeetingContext } from './hooks/storage-for-live-meeting'
import type { Settings } from "@screenpipe/browser"
import { cn } from "@/lib/utils"
import { useRecentChunks } from './hooks/pull-meetings-from-screenpipe'
import { useAutoScroll } from './hooks/auto-scroll'

interface DiffChunk {
    value: string
    added?: boolean
    removed?: boolean
}

interface TranscriptionViewProps {
    isLoading: boolean
    settings: Settings
}

function DiffText({ diffs }: { diffs: DiffChunk[] | null }) {
    if (!diffs) return null
    
    return (
        <>
            {diffs.map((diff, i) => {
                if (diff.added) {
                    return <span key={i} className="bg-green-100">{diff.value}</span>
                }
                if (diff.removed) {
                    return <span key={i} className="bg-red-100 line-through">{diff.value}</span>
                }
                return <span key={i}>{diff.value}</span>
            })}
        </>
    )
}

export function TranscriptionView({ isLoading, settings }: TranscriptionViewProps) {
    const { title, notes, setNotes, data, updateStore, reloadData, improvingChunks, recentlyImproved } = useMeetingContext()
    const [viewMode, setViewMode] = useState<'overlay' | 'sidebar' | 'timestamp'>('overlay')
    const [useOverlay, setUseOverlay] = useState(false)
    const [mergeModalOpen, setMergeModalOpen] = useState(false)
    const [nameModalOpen, setNameModalOpen] = useState(false)
    const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null)
    const [targetSpeaker, setTargetSpeaker] = useState<string | null>(null)
    const [customSpeaker, setCustomSpeaker] = useState<string>('')
    const [speakerMappings, setSpeakerMappings] = useState<Record<string, string>>({})
    const [selectedText, setSelectedText] = useState('')
    const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null)
    const [vocabDialogOpen, setVocabDialogOpen] = useState(false)
    const [vocabEntry, setVocabEntry] = useState('')
    const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null)
    const lastProcessedChunkRef = useRef<number>(0)
    const [showLoadButton, setShowLoadButton] = useState(false)
    const [loadingHistory, setLoadingHistory] = useState(false)
    const { fetchRecentChunks } = useRecentChunks()
    const initialDataLoadRef = useRef(true)
    const { scrollRef, onScroll, isScrolledToBottom } = useAutoScroll(data?.chunks || [])

    useEffect(() => {
        console.log('transcription view mounted')
        return () => console.log('transcription view unmounted')
    }, [])

    useEffect(() => {
        if (data?.editedMergedChunks && initialDataLoadRef.current) {
            console.log('loading initial data from storage')
            lastProcessedChunkRef.current = data.chunks?.length - 1 || 0
            initialDataLoadRef.current = false
        }
    }, [data])

    const getDisplaySpeaker = (speaker: string) => {
        return speakerMappings[speaker] ?? speaker
    }

    const formatSpeaker = (speaker: string | undefined) => {
        if (!speaker) return 'unknown'
        return speaker.startsWith('speaker_') ? `speaker ${speaker.split('_')[1]}` : speaker
    }

    const uniqueSpeakers = useMemo(() => {
        const speakerFirstAppearance = new Map<string, Date>()
        data?.chunks?.forEach(chunk => {
            if (chunk.speaker !== undefined) {
                const mappedSpeaker = speakerMappings[chunk.speaker] || chunk.speaker
                if (!speakerFirstAppearance.has(mappedSpeaker)) {
                    speakerFirstAppearance.set(mappedSpeaker, new Date(chunk.timestamp))
                }
            }
        })

        return Array.from(new Set(data?.chunks?.map(chunk => {
            const speaker = chunk.speaker
            return speaker !== undefined ? speakerMappings[speaker] || speaker : undefined
        })))
            .filter((s): s is string => s !== undefined)
            .sort((a, b) => {
                const timeA = speakerFirstAppearance.get(a)?.getTime() || 0
                const timeB = speakerFirstAppearance.get(b)?.getTime() || 0
                return timeB - timeA
            })
    }, [data?.chunks, speakerMappings])

    const loadStoredData = async () => {
        try {
            setLoadingHistory(true)
            await fetchRecentChunks()
            await reloadData()
        } catch (error) {
            console.error('failed to load history:', error)
        } finally {
            setLoadingHistory(false)
        }
    }

    const mergeSpeakers = async (newSpeaker: string) => {
        if (!selectedSpeaker) return
        if (!data) return

        console.log('merging speaker', selectedSpeaker, 'into', newSpeaker)
        const newMappings = {
            ...speakerMappings,
            [selectedSpeaker]: newSpeaker,
            ...(targetSpeaker ? { [targetSpeaker]: newSpeaker } : {})
        }
        setSpeakerMappings(newMappings)
        await updateStore({ ...data, speakerMappings: newMappings })
        setMergeModalOpen(false)
        setNameModalOpen(false)
        setTargetSpeaker(null)
        setCustomSpeaker('')
    }

    const handleSelection = () => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) {
            setSelectedText('')
            setSelectionPosition(null)
            return
        }

        const text = selection.toString().trim()
        if (text) {
            const range = selection.getRangeAt(0)
            const rect = range.getBoundingClientRect()
            setSelectedText(text)
            setSelectionPosition({ x: rect.left, y: rect.top })
        }
    }

    const addToVocabulary = () => {
        console.log('opening vocabulary dialog for:', selectedText)
        setVocabEntry(selectedText)
        setVocabDialogOpen(true)
        setSelectionPosition(null)
    }

    const handleSaveVocab = async () => {
        try {
            console.log('saving vocabulary:', selectedText, 'as', vocabEntry)
            await addVocabularyEntry(selectedText, vocabEntry)
            
            setNotification({ message: "added to vocabulary", type: 'success' })
            setTimeout(() => setNotification(null), 2000)
            setVocabDialogOpen(false)
            setSelectedText('')
            setVocabEntry('')
        } catch (error) {
            console.error('failed to save vocabulary:', error)
            setNotification({ message: "failed to save vocabulary", type: 'error' })
            setTimeout(() => setNotification(null), 2000)
        }
    }

    const handleGenerateNote = async (chunk: TranscriptionChunk) => {
        try {
            const note = await generateMeetingNote([chunk], settings)
            setNotes([...notes, { id: crypto.randomUUID(), text: note, timestamp: new Date(chunk.timestamp) }])
        } catch (error) {
            console.error('failed to generate note:', error)
        }
    }

    const mergedChunks = data?.mergedChunks || []

    return (
        <>
            <div className="relative h-full flex flex-col">
                {showLoadButton && (
                    <div className="absolute top-2 right-2 z-10">
                        <button
                            onClick={loadStoredData}
                            className="px-3 py-1 bg-white text-black border border-black text-sm rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
                        >
                            {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            load history
                        </button>
                    </div>
                )}
                <div
                    ref={scrollRef}
                    onScroll={onScroll}
                    onMouseUp={handleSelection}
                    className="flex-1 overflow-y-auto bg-card min-h-0"
                >
                    {(!data?.chunks || data.chunks.length === 0) && (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            <p>waiting for transcription...</p>
                        </div>
                    )}
                    {data?.chunks && data.chunks.length > 0 && (
                        <div className="space-y-2 relative p-4">
                            <button
                                onClick={() => setViewMode(prev => {
                                    if (prev === 'overlay') return 'sidebar'
                                    if (prev === 'sidebar') return 'timestamp'
                                    return 'overlay'
                                })}
                                className="fixed top-2 left-2 p-2 hover:bg-gray-100 rounded-md transition-colors z-10 bg-background"
                                title={`switch to ${viewMode === 'overlay' ? 'sidebar' : viewMode === 'sidebar' ? 'timestamp' : 'overlay'} view`}
                            >
                                {viewMode === 'overlay' ? <LayoutList className="h-4 w-4" /> : viewMode === 'sidebar' ? <Layout className="h-4 w-4" /> : <Layout className="h-4 w-4" />}
                            </button>
                            {mergedChunks.map((chunk) => (
                                <div 
                                    key={chunk.id}
                                    className="text-sm mb-2 group relative"
                                >
                                    {viewMode === 'overlay' ? (
                                        <>
                                            <ChunkOverlay
                                                timestamp={chunk.timestamp}
                                                speaker={chunk.speaker}
                                                displaySpeaker={chunk.speaker ? getDisplaySpeaker(chunk.speaker) : 'speaker_0'}
                                                onSpeakerClick={() => {
                                                    if (chunk.speaker) {
                                                        setSelectedSpeaker(chunk.speaker)
                                                        setMergeModalOpen(true)
                                                    }
                                                }}
                                                onGenerateNote={() => handleGenerateNote(chunk)}
                                            />
                                            <div className="relative">
                                                <div className={cn(
                                                    "outline-none rounded px-1 -mx-1",
                                                    improvingChunks[chunk.id] && "animate-shimmer bg-gradient-to-r from-transparent via-gray-100/50 to-transparent bg-[length:200%_100%]",
                                                    recentlyImproved[chunk.id] && "animate-glow"
                                                )}>
                                                    {data?.editedMergedChunks[chunk.id]?.diffs ? (
                                                        <DiffText diffs={data.editedMergedChunks[chunk.id].diffs} />
                                                    ) : data?.editedMergedChunks[chunk.id]?.text || chunk.text}
                                                </div>
                                            </div>
                                        </>
                                    ) : viewMode === 'timestamp' ? (
                                        <div className="flex gap-1">
                                            <div className="w-16 flex-shrink-0 text-xs text-gray-500">
                                                <div>{new Date(chunk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                {chunk.speaker !== undefined && (
                                                    <button
                                                        onClick={() => {
                                                            setSelectedSpeaker(chunk.speaker!)
                                                            setMergeModalOpen(true)
                                                        }}
                                                        className="hover:bg-gray-100 rounded-sm transition-colors"
                                                    >
                                                        {formatSpeaker(getDisplaySpeaker(chunk.speaker))}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="outline-none rounded flex-1">
                                                {chunk.text}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex gap-1">
                                            <div className="w-16 flex-shrink-0 text-xs text-gray-500 flex items-start">
                                                {chunk.speaker !== undefined && (
                                                    <button
                                                        onClick={() => {
                                                            setSelectedSpeaker(chunk.speaker!)
                                                            setMergeModalOpen(true)
                                                        }}
                                                        className="hover:bg-gray-100 rounded-sm transition-colors text-left w-full"
                                                    >
                                                        {formatSpeaker(getDisplaySpeaker(chunk.speaker))}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="outline-none rounded flex-1">
                                                {chunk.text}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {!isScrolledToBottom && (
                <button
                    onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
                    className="absolute bottom-4 right-4 p-2 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors"
                >
                    <ArrowDown className="h-4 w-4" />
                </button>
            )}

            {selectedText && selectionPosition && (
                <button
                    onClick={addToVocabulary}
                    style={{
                        position: 'fixed',
                        left: `${selectionPosition.x}px`,
                        top: `${selectionPosition.y - 30}px`,
                    }}
                    className="px-2 py-1 bg-black text-white text-xs rounded shadow-lg hover:bg-gray-800 transition-colors"
                >
                    add to vocabulary
                </button>
            )}

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
                                            setTargetSpeaker(speaker as string)
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

            <Dialog open={vocabDialogOpen} onOpenChange={setVocabDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>add to vocabulary</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                        <Input
                            value={vocabEntry}
                            onChange={(e) => setVocabEntry(e.target.value)}
                            placeholder="enter corrected text"
                        />
                        <DialogFooter>
                            <Button onClick={handleSaveVocab}>
                                save
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {notification && (
                <div 
                    className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md text-sm ${
                        notification.type === 'success' ? 'bg-black text-white' : 'bg-red-500 text-white'
                    }`}
                >
                    {notification.message}
                </div>
            )}
        </>
    )
} 