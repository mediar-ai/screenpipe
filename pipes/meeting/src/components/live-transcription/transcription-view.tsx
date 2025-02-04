'use client'

import { Loader2, ArrowDown, LayoutList, Layout } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useState, useMemo, useEffect, useRef } from "react"
import { TranscriptionChunk, ServiceStatus } from "../meeting-history/types"
import { ChunkOverlay } from "./floating-container-buttons"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { addVocabularyEntry } from './hooks/storage-vocabulary'
import { generateMeetingNote } from './hooks/ai-create-note-based-on-chunk'
import { improveTranscription } from './hooks/ai-improve-chunk-transcription'
import { useMeetingContext } from './hooks/storage-for-live-meeting'
import type { Settings } from "@screenpipe/browser"
import { cn } from "@/lib/utils"
import { 
    storeLiveChunks,
    LiveMeetingData,
} from './hooks/storage-for-live-meeting'
import { useRecentChunks } from './hooks/pull-meetings-from-screenpipe'

interface TranscriptionViewProps {
    chunks: TranscriptionChunk[]
    isLoading: boolean
    scrollRef: React.RefObject<HTMLDivElement>
    onScroll: () => void
    isAutoScrollEnabled: boolean
    isScrolledToBottom: boolean
    settings: Settings
}

export function TranscriptionView({
    chunks,
    isLoading,
    scrollRef,
    onScroll,
    isAutoScrollEnabled,
    isScrolledToBottom,
    settings
}: TranscriptionViewProps) {
    const { title, notes, setSegments, setNotes, data, updateStore } = useMeetingContext()
    const [viewMode, setViewMode] = useState<'overlay' | 'sidebar' | 'timestamp'>('overlay')
    const [useOverlay, setUseOverlay] = useState(false)
    const [mergeModalOpen, setMergeModalOpen] = useState(false)
    const [nameModalOpen, setNameModalOpen] = useState(false)
    const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null)
    const [targetSpeaker, setTargetSpeaker] = useState<string | null>(null)
    const [customSpeaker, setCustomSpeaker] = useState<string>('')
    const [speakerMappings, setSpeakerMappings] = useState<Record<string, string>>({})
    const [editedChunks, setEditedChunks] = useState<Record<number, string>>({})
    const [selectedText, setSelectedText] = useState('')
    const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null)
    const [vocabDialogOpen, setVocabDialogOpen] = useState(false)
    const [vocabEntry, setVocabEntry] = useState('')
    const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null)
    const [improvingChunks, setImprovingChunks] = useState<Record<number, boolean>>({})
    const [recentlyImproved, setRecentlyImproved] = useState<Record<number, boolean>>({})
    const lastProcessedChunkRef = useRef<number>(-1)
    const [showLoadButton, setShowLoadButton] = useState(false)
    const [loadingHistory, setLoadingHistory] = useState(false)
    const { fetchRecentChunks } = useRecentChunks()

    // Add logging for component mount/unmount
    useEffect(() => {
        console.log('transcription view mounted', {
            chunksCount: chunks.length,
            isLoading,
            hasTitle: !!title,
            hasNotes: notes.length > 0
        })
        return () => {
            console.log('transcription view unmounting', {
                chunksCount: chunks.length,
                isLoading
            })
        }
    }, [])

    // Add logging for chunks updates
    useEffect(() => {
        console.log('chunks updated in transcription view', {
            count: chunks.length,
            lastChunk: chunks[chunks.length - 1]?.text,
            isLoading
        })
    }, [chunks])

    // Helper functions
    const getDisplaySpeaker = (speaker: string) => {
        return speakerMappings[speaker] ?? speaker
    }

    const formatSpeaker = (speaker: string | undefined) => {
        if (!speaker) return 'unknown'
        return speaker.startsWith('speaker_') ? `speaker ${speaker.split('_')[1]}` : speaker
    }

    // Memoized values
    const uniqueSpeakers = useMemo(() => {
        const speakerFirstAppearance = new Map<string, Date>()
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
            .filter((s): s is string => s !== undefined)
            .sort((a, b) => {
                const timeA = speakerFirstAppearance.get(a)?.getTime() || 0
                const timeB = speakerFirstAppearance.get(b)?.getTime() || 0
                return timeB - timeA
            })
    }, [chunks, speakerMappings])

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

    // Load initial state
    useEffect(() => {
        console.log('storing chunks in transcription view', {
            count: chunks.length,
            isLoading
        })
        storeLiveChunks(chunks)
    }, [chunks])

    const loadStoredData = async () => {
        try {
            setLoadingHistory(true)
            await fetchRecentChunks()
            
            if (data) {
                console.log('loaded stored meeting data:', data)
                setEditedChunks(data.editedChunks)
                setSpeakerMappings(data.speakerMappings)
                lastProcessedChunkRef.current = data.lastProcessedIndex
                setShowLoadButton(false)
            }
        } catch (error) {
            console.error('failed to load history:', error)
        } finally {
            setLoadingHistory(false)
        }
    }

    // Store chunks when they update
    useEffect(() => {
        console.log('storing chunks in transcription view', {
            count: chunks.length,
            isLoading
        })
        storeLiveChunks(chunks)
    }, [chunks])

    // Move handleTextEdit inside the component
    const handleTextEdit = async (index: number, newText: string) => {
        console.log('text edited for chunk', index, ':', newText)
        if (!data) return

        const newEditedChunks = {
            ...editedChunks,
            [index]: newText
        }
        setEditedChunks(newEditedChunks)
        await updateStore({ ...data, editedChunks: newEditedChunks })
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

    // Update last processed index
    useEffect(() => {
        if (lastProcessedChunkRef.current >= 0) {
            if (data) {
                updateStore({ 
                    ...data, 
                    lastProcessedIndex: lastProcessedChunkRef.current 
                })
            }
        }
    }, [lastProcessedChunkRef.current, data, updateStore])

    // Add selection handler
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

    // Update vocabulary handler to open dialog
    const addToVocabulary = () => {
        console.log('opening vocabulary dialog for:', selectedText)
        setVocabEntry(selectedText)
        setVocabDialogOpen(true)
        setSelectionPosition(null)
    }

    // Handle saving vocabulary
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

    // Process previous merged chunk when a new one arrives
    useEffect(() => {
        const currentChunkIndex = mergeChunks.length - 1
        const previousChunkIndex = currentChunkIndex - 1

        // Only process if we have a previous chunk and haven't processed it yet
        if (previousChunkIndex >= 0 && 
            previousChunkIndex > lastProcessedChunkRef.current && 
            !improvingChunks[previousChunkIndex] &&
            settings.openaiApiKey) {
            
            const improveChunk = async () => {
                setImprovingChunks(prev => ({ ...prev, [previousChunkIndex]: true }))
                
                try {
                    const chunk = mergeChunks[previousChunkIndex]
                    console.log('improving previous merged chunk:', chunk.text)
                    
                    const contextChunks = mergeChunks.slice(
                        Math.max(0, previousChunkIndex - 4), 
                        previousChunkIndex + 1
                    )
                    
                    const improved = await improveTranscription(
                        chunk.text,
                        {
                            meetingTitle: title,
                            recentChunks: contextChunks,
                            notes: notes.map(note => note.text),
                        },
                        settings
                    )

                    if (improved !== chunk.text) {
                        console.log('chunk improved:', improved)
                        await handleTextEdit(previousChunkIndex, improved)
                        setRecentlyImproved(prev => ({ ...prev, [previousChunkIndex]: true }))
                        setTimeout(() => {
                            setRecentlyImproved(prev => ({ ...prev, [previousChunkIndex]: false }))
                        }, 1000)
                    }
                    
                    lastProcessedChunkRef.current = previousChunkIndex
                } catch (error) {
                    console.error('failed to improve chunk:', error)
                } finally {
                    setImprovingChunks(prev => ({ ...prev, [previousChunkIndex]: false }))
                }
            }

            improveChunk()
        }
    }, [mergeChunks, title, notes, settings, data, updateStore])

    // Update segments when mergeChunks changes
    useEffect(() => {
        console.log('updating segments in transcription view', {
            mergedChunksCount: mergeChunks.length,
            editedChunksCount: Object.keys(editedChunks).length,
            speakerMappingsCount: Object.keys(speakerMappings).length
        })
        const segments = mergeChunks.map(chunk => ({
            timestamp: chunk.timestamp,
            transcription: editedChunks[chunk.id] ?? chunk.text,
            deviceName: chunk.deviceName || '',
            speaker: chunk.speaker || 'speaker_0'
        }))
        setSegments(segments)
    }, [mergeChunks, editedChunks, speakerMappings])

    const handleGenerateNote = async (index: number) => {
        try {
            console.log('generating note for chunk:', index)
            const contextChunks = mergeChunks.slice(
                Math.max(0, index - 4),
                index + 1
            )
            
            const note = await generateMeetingNote(contextChunks, settings)
            console.log('generated note:', note)
            
            // Add the generated note to the meeting context
            setNotes([...notes, {
                id: crypto.randomUUID(),
                text: note,
                timestamp: new Date(mergeChunks[index].timestamp)
            }])
            
        } catch (error) {
            console.error('failed to generate note:', error)
        }
    }

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
                    {mergeChunks.length === 0 && (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            <p>waiting for transcription...</p>
                        </div>
                    )}
                    {mergeChunks.length > 0 && (
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
                            {mergeChunks.map((chunk, i) => (
                                <div key={i} className="text-sm mb-2 group relative">
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
                                                onGenerateNote={() => handleGenerateNote(i)}
                                            />
                                            <div className="relative">
                                                <div
                                                    contentEditable
                                                    suppressContentEditableWarning
                                                    onBlur={(e) => handleTextEdit(i, e.currentTarget.textContent || '')}
                                                    className={cn(
                                                        "outline-none focus:ring-1 focus:ring-gray-200 rounded px-1 -mx-1",
                                                        improvingChunks[i] && "animate-shimmer bg-gradient-to-r from-transparent via-gray-100/50 to-transparent bg-[length:200%_100%]",
                                                        recentlyImproved[i] && "animate-glow"
                                                    )}
                                                >
                                                    {editedChunks[i] ?? chunk.text}
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
                                            <div
                                                contentEditable
                                                suppressContentEditableWarning
                                                onBlur={(e) => handleTextEdit(i, e.currentTarget.textContent || '')}
                                                className="outline-none focus:ring-1 focus:ring-gray-200 rounded flex-1"
                                            >
                                                {editedChunks[i] ?? chunk.text}
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
                                            <div
                                                contentEditable
                                                suppressContentEditableWarning
                                                onBlur={(e) => handleTextEdit(i, e.currentTarget.textContent || '')}
                                                className="outline-none focus:ring-1 focus:ring-gray-200 rounded flex-1"
                                            >
                                                {editedChunks[i] ?? chunk.text}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {!isAutoScrollEnabled && !isScrolledToBottom && (
                <button
                    onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
                    className="absolute bottom-4 right-4 p-2 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors"
                >
                    <ArrowDown className="h-4 w-4" />
                </button>
            )}

            {/* Add vocabulary button */}
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