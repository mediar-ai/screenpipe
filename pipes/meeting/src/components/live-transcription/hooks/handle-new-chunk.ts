import { TranscriptionChunk, Note } from "../../meeting-history/types"
import { LiveMeetingData } from "./storage-for-live-meeting"
import { improveTranscription } from './ai-improve-chunk-transcription'
import { generateMeetingNote } from './ai-create-note-based-on-chunk'
import { diffWords } from 'diff'
import type { Settings } from "@screenpipe/browser"

interface DiffChunk {
    value: string
    added?: boolean
    removed?: boolean
}

export interface ImprovedChunk {
    text: string
    diffs: DiffChunk[] | null
}

interface HandleNewChunkDeps {
    setData: (fn: (currentData: LiveMeetingData | null) => LiveMeetingData | null) => void
    setImprovingChunks: (fn: (prev: Record<number, boolean>) => Record<number, boolean>) => void
    setRecentlyImproved: (fn: (prev: Record<number, boolean>) => Record<number, boolean>) => void
    updateStore: (newData: LiveMeetingData) => Promise<boolean>
    settings: Settings
}

export function createHandleNewChunk(deps: HandleNewChunkDeps) {
    const { setData, setImprovingChunks, setRecentlyImproved, updateStore, settings } = deps
    const processingChunks = new Set<number>()
    let isProcessing = false
    
    // Add buffer for raw chunks
    const noteBuffer: TranscriptionChunk[] = []
    
    async function tryGenerateNote() {
        const now = Date.now()
        const totalText = noteBuffer.map(chunk => chunk.text).join(' ')
        const wordCount = totalText.split(/\s+/).length
        
        // console.log('note generation check:', {
        //     bufferedChunks: noteBuffer.length,
        //     wordCount,
        //     meetsWordThreshold: wordCount >= 50,
        //     bufferContent: totalText
        // })

        // Get current data to check if AI notes are enabled
        let shouldGenerate = false
        let existingNotes: string[] = []
        
        setData(currentData => {
            shouldGenerate = currentData?.isAiNotesEnabled ?? true
            existingNotes = currentData?.notes?.map(n => n.text) || []
            return currentData
        })

        // Early return if AI notes are disabled
        if (!shouldGenerate || wordCount < 50) {
            return
        }

        const note = await generateMeetingNote(
            noteBuffer, 
            settings,
            existingNotes
        ).catch(error => {
            console.error('failed to generate note:', error)
            return null
        })

        setData(current => {
            if (note && current) {
                const timestamp = noteBuffer.length > 0 
                    ? new Date(noteBuffer[0].timestamp)
                    : new Date(now)

                const newData = {
                    ...current,
                    notes: [...current.notes, {
                        id: `note-${now}`,
                        text: `• ${note}`,
                        timestamp,
                        type: 'auto'
                    }]
                }
                void updateStore(newData)
                return newData
            }
            return current
        })
        // Clear buffer after successful note generation
        noteBuffer.length = 0
    }

    return async function handleNewChunk(chunk: TranscriptionChunk) {
        if (isProcessing) {
            console.log('skipping chunk processing - already processing another chunk')
            return
        }

        isProcessing = true
        try {
            // Add new chunk to note buffer immediately
            noteBuffer.push(chunk)
            void tryGenerateNote()

            setData(currentData => {
                if (!currentData) return null

                const chunks = [...currentData.chunks, chunk]
                
                const mergedChunks = chunks.reduce<TranscriptionChunk[]>((acc, curr) => {
                    const prev = acc[acc.length - 1]
                    
                    if (prev && prev.speaker === curr.speaker) {
                        prev.text += ' ' + curr.text
                        return acc
                    }
                    
                    acc.push(Object.assign({}, curr))
                    return acc
                }, [])

                const previousMerged = mergedChunks.length > 1 ? mergedChunks[mergedChunks.length - 2] : null
                
                if (previousMerged && 
                    settings.aiProviderType === "screenpipe-cloud" && 
                    !currentData.editedMergedChunks[previousMerged.id] &&
                    !processingChunks.has(previousMerged.id) &&
                    currentData.isAiNotesEnabled) {
                    
                    console.log('processing chunk:', { id: previousMerged.id, text: previousMerged.text })
                    processingChunks.add(previousMerged.id)
                    setImprovingChunks((prev: Record<number, boolean>) => ({ ...prev, [previousMerged.id]: true }))
                    
                    const context = {
                        meetingTitle: currentData.title || '',
                        recentChunks: mergedChunks.slice(-3),
                        notes: currentData.notes.map(note => note.text)
                    }
                    
                    void improveTranscription(previousMerged.text, context, settings)
                        .then(improved => {
                            const diffs = diffWords(previousMerged.text, improved)
                            
                            processingChunks.delete(previousMerged.id)
                            setImprovingChunks((prev: Record<number, boolean>) => {
                                const next = { ...prev }
                                delete next[previousMerged.id]
                                return next
                            })
                            setRecentlyImproved((prev: Record<number, boolean>) => ({ ...prev, [previousMerged.id]: true }))

                            setData(current => {
                                if (!current) return null
                                const newData = {
                                    ...current,
                                    editedMergedChunks: {
                                        ...current.editedMergedChunks,
                                        [previousMerged.id]: {
                                            text: improved,
                                            diffs
                                        }
                                    }
                                }
                                void updateStore(newData)
                                return newData
                            })

                            if (improved) {
                                const improvedChunk = {
                                    ...previousMerged,
                                    text: improved
                                }
                                noteBuffer.push(improvedChunk)
                                void tryGenerateNote()
                            }

                            setTimeout(() => {
                                setRecentlyImproved(prev => {
                                    const next = { ...prev }
                                    delete next[previousMerged.id]
                                    return next
                                })
                            }, 5000)
                        })
                        .catch(error => {
                            console.error('failed to improve chunk:', error)
                            processingChunks.delete(previousMerged.id)
                            setImprovingChunks(prev => {
                                const next = { ...prev }
                                delete next[previousMerged.id]
                                return next
                            })
                        })
                }

                const newData: LiveMeetingData = {
                    ...currentData,
                    chunks,
                    mergedChunks,
                    lastProcessedIndex: chunks.length
                }
                
                void updateStore(newData)
                return newData
            })
        } finally {
            isProcessing = false
        }
    }
} 