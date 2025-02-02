import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { TranscriptionChunk, Note, MeetingSegment } from "../../meeting-history/types"
import { MeetingAnalysis } from "./ai-create-all-notes"
import localforage from "localforage"

// Storage setup
export const liveStore = localforage.createInstance({
    name: "live-meetings",
    storeName: "transcriptions"
})

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

const LIVE_MEETING_KEY = 'current-live-meeting'

// Context creation
const MeetingContext = createContext<MeetingContextType | undefined>(undefined)

export function MeetingProvider({ children }: { children: ReactNode }) {
    const [data, setData] = useState<LiveMeetingData | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const loadData = async () => {
            try {
                const stored = await liveStore.getItem<LiveMeetingData>(LIVE_MEETING_KEY)
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
                console.error('failed to load meeting data:', error)
            } finally {
                setIsLoading(false)
            }
        }
        loadData()
    }, [])

    const updateStore = async (newData: LiveMeetingData) => {
        try {
            await liveStore.setItem(LIVE_MEETING_KEY, newData)
            setData(newData)
        } catch (error) {
            console.error('failed to update meeting data:', error)
        }
    }

    const setTitle = async (title: string) => {
        if (!data) return
        console.log('setting title:', title)
        await updateStore({ ...data, title })
    }

    const setNotes = async (notes: Note[]) => {
        if (!data) return
        console.log('setting notes:', notes.length)
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

    const value = {
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
    }

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
        console.log('loading live meeting data')
        return await liveStore.getItem<LiveMeetingData>(LIVE_MEETING_KEY)
    } catch (error) {
        console.error('failed to load live meeting data:', error)
        return null
    }
}

export async function clearLiveMeetingData(): Promise<void> {
    try {
        console.log('clearing live meeting data')
        await liveStore.removeItem(LIVE_MEETING_KEY)
    } catch (error) {
        console.error('failed to clear live meeting data:', error)
        throw error
    }
} 