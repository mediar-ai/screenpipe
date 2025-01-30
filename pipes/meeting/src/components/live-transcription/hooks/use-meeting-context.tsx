import { createContext, useContext, useState, ReactNode } from 'react'
import { Note } from '../types'

interface MeetingContextType {
    title: string
    setTitle: (title: string) => void
    notes: Note[]
    setNotes: (notes: Note[]) => void
}

const MeetingContext = createContext<MeetingContextType | undefined>(undefined)

export function MeetingProvider({ children }: { children: ReactNode }) {
    const [title, setTitle] = useState("")
    const [notes, setNotes] = useState<Note[]>([])

    const value = {
        title,
        setTitle,
        notes,
        setNotes
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