import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react'
import { TranscriptionChunk, Note, MeetingSegment } from "../../meeting-history/types"
import { MeetingAnalysis } from "./ai-create-all-notes"
import localforage from "localforage"

// Storage setup
export const liveStore = localforage.createInstance({
    name: "live-meetings",
    storeName: "transcriptions"
})

// Export the key
export const LIVE_MEETING_KEY = 'current-live-meeting'

export interface LiveMeetingData {
    chunks: TranscriptionChunk[]
    editedChunks: Record<number, string>
    speakerMappings: Record<string, string>
    lastProcessedIndex: number
    startTime: string
    endTime?: string
    title: string | null
    notes: Note[]
    analysis: MeetingAnalysis | null
    deviceNames: Set<string>
    selectedDevices: Set<string>
}

// Context type
interface MeetingContextType {
    title: string
    setTitle: (title: string) => Promise<void>
    notes: Note[]
    setNotes: (notes: Note[]) => Promise<void>
    segments: MeetingSegment[]
    setSegments: (segments: MeetingSegment[]) => Promise<void>
    analysis: MeetingAnalysis | null
    setAnalysis: (analysis: MeetingAnalysis | null) => Promise<void>
    isLoading: boolean
    data: LiveMeetingData | null
    updateStore: (newData: LiveMeetingData) => Promise<void>
}

// Context creation
const MeetingContext = createContext<MeetingContextType | undefined>(undefined)

export function MeetingProvider({ children }: { children: ReactNode }) {
    const [data, setData] = useState<LiveMeetingData | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const loadData = async () => {
            try {
                console.log('MeetingProvider: loading data')
                const stored = await liveStore.getItem<LiveMeetingData>(LIVE_MEETING_KEY)
                console.log('MeetingProvider: loaded data:', {
                    exists: !!stored,
                    chunks: stored?.chunks?.length,
                    title: stored?.title,
                    notes: stored?.notes?.length,
                    notesData: stored?.notes?.map(n => ({
                        id: n.id,
                        text: n.text?.slice(0, 50),
                        timestamp: n.timestamp
                    }))
                })
                
                if (!stored) {
                    console.log('MeetingProvider: no stored data, initializing new')
                }
                
                setData(stored || {
                    chunks: [],
                    editedChunks: {},
                    speakerMappings: {},
                    lastProcessedIndex: -1,
                    startTime: new Date().toISOString(),
                    title: null,
                    notes: [],
                    analysis: null,
                    deviceNames: new Set(),
                    selectedDevices: new Set()
                })
            } catch (error) {
                console.error('MeetingProvider: failed to load meeting data:', error)
            } finally {
                setIsLoading(false)
            }
        }
        loadData()
    }, [])

    const updateStore = async (newData: LiveMeetingData) => {
        // Debug: log current and new notes details
        console.log('updateStore: checking changes', {
            currentNotes: data?.notes?.length,
            newNotes: newData.notes?.length,
            currentNotesData: data?.notes?.map(n => ({
                text: n.text?.slice(0, 50),
                timestamp: n.timestamp,
                id: n.id
            })),
            newNotesData: newData.notes?.map(n => ({
                text: n.text?.slice(0, 50),
                timestamp: n.timestamp,
                id: n.id
            })),
            stack: new Error().stack?.split('\n').slice(1, 3)
        });

        // Debug: log title differences for clarity
        console.log('updateStore: checking title change', {
            currentTitle: data?.title,
            newTitle: newData.title,
            titleChanged: data?.title !== newData.title
        });

        // If no previous data, always update
        if (!data) {
            console.log('updateStore: no previous data, saving');
            await liveStore.setItem(LIVE_MEETING_KEY, newData);
            setData(newData);
            return;
        }

        // Determine if notes have changed
        const notesChanged =
            data.notes.length !== newData.notes.length ||
            JSON.stringify(data.notes) !== JSON.stringify(newData.notes);

        // Determine if title has changed
        const titleChanged = data.title !== newData.title;

        // If neither notes nor title changed, skip saving
        if (!notesChanged && !titleChanged) {
            console.log('updateStore: no changes detected', { notesChanged, titleChanged });
            return;
        }

        console.log('updateStore: saving changes', {
            currentNotes: data.notes.length,
            newNotes: newData.notes.length,
            notesChanged,
            titleChanged
        });

        try {
            await liveStore.setItem(LIVE_MEETING_KEY, newData);
            setData(newData);
        } catch (error) {
            console.error('updateStore: failed:', error);
        }
    };

    const setTitle = async (title: string) => {
        if (!data) {
            console.log('setTitle: no data available')
            return
        }
        console.log('setTitle: starting update', {
            oldTitle: data.title,
            newTitle: title,
            dataState: !!data
        })
        await updateStore({ ...data, title })
        console.log('setTitle: completed update')
    }

    const setNotes = async (notes: Note[]) => {
        if (!data) return
        console.log('setting notes:', {
            count: notes.length,
            notes: notes.map(n => ({
                text: n.text?.slice(0, 50),
                timestamp: n.timestamp,
                id: n.id
            })),
            stack: new Error().stack?.split('\n').slice(1,3)
        })
        await updateStore({ ...data, notes })
    }

    const setSegments = async (segments: MeetingSegment[]) => {
        if (!data) return
        console.log('setting segments:', segments.length)
        const chunks = segments.map((seg, index) => ({
            id: Date.now() + index,
            timestamp: seg.timestamp,
            text: seg.transcription,
            deviceName: seg.deviceName,
            speaker: seg.speaker,
            isInput: seg.deviceName?.toLowerCase().includes('input') || false,
            device: seg.deviceName || 'unknown',
        }))
        await updateStore({ ...data, chunks })
    }

    const setAnalysis = async (analysis: MeetingAnalysis | null) => {
        if (!data) return
        console.log('setting analysis:', analysis)
        await updateStore({ ...data, analysis })
    }

    const value = useMemo(() => ({
        title: data?.title || '',
        setTitle,
        notes: data?.notes || [],
        setNotes,
        segments: (data?.chunks || []).map(chunk => ({
            timestamp: chunk.timestamp,
            transcription: data?.editedChunks[chunk.id] || chunk.text,
            deviceName: chunk.deviceName || '',
            speaker: data?.speakerMappings[chunk.speaker || 'speaker_0'] || chunk.speaker || 'speaker_0'
        })),
        setSegments,
        analysis: data?.analysis || null,
        setAnalysis,
        isLoading,
        data,
        updateStore
    }), [data, isLoading])

    return (
        <MeetingContext.Provider value={value}>
            {children}
        </MeetingContext.Provider>
    )
}

export function useMeetingContext() {
    const context = useContext(MeetingContext)
    if (!context) {
        throw new Error('useMeetingContext must be used within a MeetingProvider')
    }
    return context
}

// Storage operations
export const getCurrentKey = () => LIVE_MEETING_KEY

export const clearCurrentKey = () => {
    liveStore.removeItem(LIVE_MEETING_KEY)
    console.log('cleared live meeting data')
}

export async function storeLiveChunks(chunks: TranscriptionChunk[]): Promise<void> {
    try {
        const existing = await liveStore.getItem<LiveMeetingData>(LIVE_MEETING_KEY)
        const data: LiveMeetingData = {
            chunks,
            editedChunks: existing?.editedChunks ?? {},
            speakerMappings: existing?.speakerMappings ?? {},
            lastProcessedIndex: existing?.lastProcessedIndex ?? -1,
            startTime: existing?.startTime ?? new Date().toISOString(),
            title: existing?.title ?? null,
            notes: existing?.notes ?? [],
            analysis: existing?.analysis ?? null,
            deviceNames: existing?.deviceNames ?? new Set(),
            selectedDevices: existing?.selectedDevices ?? new Set()
        }
        console.log('storing live meeting data')
        await liveStore.setItem(LIVE_MEETING_KEY, data)
    } catch (error) {
        console.error('failed to store live meeting:', error)
    }
}

export async function getLiveMeetingData(): Promise<LiveMeetingData | null> {
    try {
        console.log('getLiveMeetingData: loading')
        const data = await liveStore.getItem<LiveMeetingData>(LIVE_MEETING_KEY)
        
        // Ensure dates are properly restored
        if (data?.notes) {
            data.notes = data.notes.map(note => ({
                ...note,
                timestamp: new Date(note.timestamp),
                editedAt: note.editedAt ? new Date(note.editedAt) : undefined
            }))
        }
        
        console.log('getLiveMeetingData: result:', {
            exists: !!data,
            chunks: data?.chunks?.length,
            title: data?.title,
            notes: data?.notes?.length,
            firstNote: data?.notes?.[0]?.text?.slice(0, 50)
        })
        return data
    } catch (error) {
        console.error('getLiveMeetingData: failed:', error)
        return null
    }
}

export async function clearLiveMeetingData(): Promise<void> {
    try {
        const currentData = await liveStore.getItem<LiveMeetingData>(LIVE_MEETING_KEY)
        console.log('clearing live meeting data:', {
            had_title: !!currentData?.title,
            notes_count: currentData?.notes.length,
            chunks_count: currentData?.chunks.length,
            analysis: !!currentData?.analysis,
            start_time: currentData?.startTime,
        })
        
        // Create empty state
        const emptyState: LiveMeetingData = {
            chunks: [],
            editedChunks: {},
            speakerMappings: {},
            lastProcessedIndex: -1,
            startTime: new Date().toISOString(),
            title: null,
            notes: [],
            analysis: null,
            deviceNames: new Set(),
            selectedDevices: new Set()
        }
        
        // Set empty state first, then remove
        await liveStore.setItem(LIVE_MEETING_KEY, emptyState)
        await liveStore.removeItem(LIVE_MEETING_KEY)
        console.log('live meeting data cleared successfully')
    } catch (error) {
        console.error('failed to clear live meeting data:', error)
        throw error
    }
} 