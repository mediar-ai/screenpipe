'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { ArrowDown, ArrowLeft, List, FileText, Wand2, Sparkles, PlusCircle, ChevronDown } from 'lucide-react'
import { useAutoScroll } from './hooks/auto-scroll'
import { TextEditor } from './text-editor-within-notes-editor'
import { Note } from '../meeting-history/types'
import { useMeetingContext, clearLiveMeetingData } from './hooks/storage-for-live-meeting'
import { generateMeetingName } from '../meeting-history/use-meeting-ai'
import { useSettings } from '@/lib/hooks/use-settings'
import { useToast } from '@/hooks/use-toast'
import { generateMeetingNotes } from './hooks/ai-create-all-notes'
import { improveNote } from './hooks/ai-create-note'
import { useRouter } from "next/navigation"

interface Props {
  onTimeClick: (timestamp: Date) => void
  onBack: () => void
  onNewMeeting: () => void
}

export function NotesEditor({ onTimeClick, onBack, onNewMeeting }: Props) {
  const { 
    title, 
    setTitle,
    notes, 
    setNotes,
    segments,
    analysis,
    setAnalysis
  } = useMeetingContext()
  const [currentMessage, setCurrentMessage] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [editingTime, setEditingTime] = useState<string | null>(null)
  const [editTimeText, setEditTimeText] = useState('')
  const [showInvalidTime, setShowInvalidTime] = useState(false)
  const [viewMode, setViewMode] = useState<'timeline' | 'text'>('text')
  const editRef = useRef<HTMLDivElement>(null)
  const editTimeRef = useRef<HTMLInputElement>(null)
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false)
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false)
  const { settings } = useSettings()
  const { toast } = useToast()
  const router = useRouter()
  const [showNav, setShowNav] = useState(false)

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }, [notes])

  const { scrollRef, onScroll, isScrolledToBottom } = useAutoScroll(
    sortedNotes.map(note => ({
      ...note,
      timestamp: note.timestamp.toISOString()
    }))
  )

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (editingId && editRef.current && !editRef.current.contains(event.target as Node)) {
        // Save the current edit text before closing
        const updatedNotes = notes.map(note => 
          note.id === editingId 
            ? { ...note, text: editText.trim() }
            : note
        )
        setNotes(updatedNotes)
        setEditingId(null)
      }
      if (editingTime && editTimeRef.current && !editTimeRef.current.contains(event.target as Node)) {
        updateTime(editingTime)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editingId, editText, editingTime, editTimeText, notes])

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentMessage.trim()) return

    const newNotes = [...notes, {
        id: crypto.randomUUID(),
        text: currentMessage.trim(),
        timestamp: new Date()
    }]
    setNotes(newNotes)
    setCurrentMessage('')
  }

  const startEditing = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent timestamp click
    setEditingId(note.id)
    setEditText(note.text)
  }

  const updateNote = async () => {
    if (!editingId) return
    const updatedNotes: Note[] = notes.map(note => 
      note.id === editingId 
        ? { ...note, text: editText.trim() }
        : note
    )
    await setNotes(updatedNotes)
    setEditingId(null)
  }

  const startEditingTime = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingTime(note.id)
    // Convert from 12-hour to 24-hour format for editing
    const time = note.timestamp.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    setEditTimeText(time)
  }

  const updateTime = async (noteId: string) => {
    try {
      const [hours, minutes, seconds] = editTimeText.split(':').map(Number)
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) ||
          hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
        throw new Error('invalid time')
      }
      
      const updatedNotes = notes.map(note => {
        if (note.id === noteId) {
          const newTime = new Date(note.timestamp)
          newTime.setHours(hours, minutes, seconds)
          return { ...note, timestamp: newTime }
        }
        return note
      })
      await setNotes(updatedNotes)
      setEditingTime(null)
    } catch (e) {
      console.log('invalid time format')
      setShowInvalidTime(true)
      setTimeout(() => {
        setShowInvalidTime(false)
        setEditingTime(null)
      }, 1000)
    }
  }

  const handleGenerateTitle = async () => {
    if (isGeneratingTitle) return
    
    setIsGeneratingTitle(true)
    try {
      console.log("generating title for meeting")
      const meeting = {
        id: crypto.randomUUID(),
        notes: notes.map(note => ({
          id: note.id,
          text: note.text,
          timestamp: note.timestamp.toISOString(),
          editedAt: note.editedAt?.toISOString()
        })),
        meetingStart: notes[0]?.timestamp.toISOString() || new Date().toISOString(),
        meetingEnd: notes[notes.length - 1]?.timestamp.toISOString() || new Date().toISOString(),
        humanName: title,
        aiName: null,
        agenda: null,
        aiSummary: null,
        participants: null,
        selectedDevices: new Set<string>(),
        deviceNames: new Set<string>(),
        segments
      }
      
      const aiName = await generateMeetingName(meeting, settings)
      await setTitle(aiName)
      
      toast({
        title: "title generated",
        description: "ai title has been generated",
      })
    } catch (error) {
      console.error("failed to generate title:", error)
      toast({
        title: "generation failed",
        description: "failed to generate ai title. please try again",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingTitle(false)
    }
  }

  const handleGenerateNotes = async () => {
    if (isGeneratingNotes) return
    
    setIsGeneratingNotes(true)
    try {
      console.log("generating ai notes analysis for meeting", { 
        notesCount: notes.length, 
        segmentsCount: segments.length,
        title,
        hasAnalysis: !!analysis
      })
      const meeting = {
        id: crypto.randomUUID(),
        notes: notes.map(note => ({
          id: note.id,
          text: note.text,
          timestamp: note.timestamp.toISOString(),
          editedAt: note.editedAt?.toISOString()
        })),
        meetingStart: notes[0]?.timestamp.toISOString() || new Date().toISOString(),
        meetingEnd: notes[notes.length - 1]?.timestamp.toISOString() || new Date().toISOString(),
        humanName: title,
        aiName: null,
        agenda: null,
        aiSummary: null,
        participants: null,
        selectedDevices: new Set<string>(),
        deviceNames: new Set<string>(),
        segments
      }
      
      const newAnalysis = await generateMeetingNotes(meeting, settings)
      await setAnalysis(newAnalysis)
      
      // Add just the summary as a new note
      const summaryNote: Note = {
        id: crypto.randomUUID(),
        text: "\n## AI Meeting Summary\n" + newAnalysis.summary.map(line => `• ${line}`).join('\n'),
        timestamp: new Date(),
        isAiGenerated: true
      }

      await setNotes([...notes, summaryNote])
      
      toast({
        title: "notes generated",
        description: "ai notes analysis completed",
      })
    } catch (error) {
      console.error("failed to generate notes:", error)
      toast({
        title: "generation failed",
        description: "failed to generate ai notes. please try again",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingNotes(false)
    }
  }

  const handleImprove = async (note: Note) => {
    console.log("improving note with context:", {
        note,
        segments_count: segments.length,
        relevant_segments: segments
            .filter(s => new Date(s.timestamp).getTime() <= note.timestamp.getTime())
    })
    
    const lastSegmentTime = segments.length > 0 
        ? new Date(segments[segments.length - 1].timestamp).getTime()
        : 0

    if (note.timestamp.getTime() > lastSegmentTime) {
        console.log("note is after last segment, using all segments")
        const context = segments
            .map(s => `[${s.timestamp}] [${s.speaker ?? 'unknown'}]: ${s.transcription}`)
            .join('\n')

        const improved = await improveNote({
            note,
            context,
            title
        }, settings)

        const updatedNotes: Note[] = notes.map(n => 
            n.id === note.id ? { ...n, text: improved } : n
        )
        await setNotes(updatedNotes)
        return
    }

    const relevantSegment = segments
        .filter(s => new Date(s.timestamp).getTime() <= note.timestamp.getTime())
        .pop()

    if (!relevantSegment) {
        console.log("no relevant segment found for note")
        return
    }

    console.log("selected segment for improvement:", {
        note_timestamp: note.timestamp,
        segment_timestamp: relevantSegment.timestamp,
        segment_text: relevantSegment.transcription,
        segment_speaker: relevantSegment.speaker
    })

    const context = `[${relevantSegment.timestamp}] [${relevantSegment.speaker ?? 'unknown'}]: ${relevantSegment.transcription}`

    const improved = await improveNote({
        note,
        context,
        title
    }, settings)

    const updatedNotes: Note[] = notes.map(n => 
        n.id === note.id ? { ...n, text: improved } : n
    )
    await setNotes(updatedNotes)
  }


  const handleNewMeeting = async () => {
    console.log('starting new meeting from notes editor')
    try {
        // Save current state for logging
        const currentTitle = title
        const notesCount = notes.length
        
        console.log('current meeting state:', {
            title: currentTitle,
            notes_count: notesCount,
            has_analysis: !!analysis
        })
        
        // Clear storage first
        await clearLiveMeetingData()
        
        // Wait a bit to ensure storage is cleared
        await new Promise(resolve => setTimeout(resolve, 100))
        
        console.log('storage cleared, forcing navigation')
        // Force a full navigation instead of client-side
        window.location.href = '/meetings/live'
        
    } catch (error) {
        console.error('failed to start new meeting:', error)
        toast({
            title: "error",
            description: "failed to start new meeting. please try again",
            variant: "destructive",
        })
    }
  }

  return (
    <div className="h-full flex flex-col bg-card relative">
      <div 
        className="absolute top-2 right-2 z-20 group"
        onMouseEnter={() => setShowNav(true)}
        onMouseLeave={() => setShowNav(false)}
      >
        <div className={`
          absolute top-0 right-0 transition-all duration-200 min-w-[200px]
          ${showNav ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'}
        `}>
          <div className="flex flex-col gap-1 bg-gray-100/80 backdrop-blur p-1 rounded-lg shadow-sm">
          <button
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-200/80 rounded transition-colors w-full text-left"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>back to meetings menu</span>
            </button>
            <button
              onClick={handleNewMeeting}
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-200/80 rounded transition-colors w-full text-left"
            >
              <PlusCircle className="h-4 w-4" />
              <span>save & start new meeting</span>
            </button>
            <button
              onClick={handleGenerateTitle}
              disabled={isGeneratingTitle}
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-200/80 rounded transition-colors w-full text-left"
            >
              <Wand2 className={`h-4 w-4 ${isGeneratingTitle ? "animate-spin" : ""}`} />
              <span>re-generate title with AI</span>
            </button>
            <button
              onClick={handleGenerateNotes}
              disabled={isGeneratingNotes}
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-200/80 rounded transition-colors w-full text-left"
            >
              <Sparkles className={`h-4 w-4 ${isGeneratingNotes ? "animate-spin" : ""}`} />
              <span>append AI summary</span>
            </button>

            
            <div className="mt-1 pt-1 border-t border-gray-200">
              <div className="px-3 py-1 text-xs text-gray-500">view type</div>
              <button
                onClick={() => setViewMode('timeline')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded transition-colors w-full text-left
                  ${viewMode === 'timeline' ? 'bg-gray-200/80' : 'hover:bg-gray-200/80'}`}
              >
                <List className="h-4 w-4" />
                <span>timeline</span>
              </button>
              <button
                onClick={() => setViewMode('text')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded transition-colors w-full text-left
                  ${viewMode === 'text' ? 'bg-gray-200/80' : 'hover:bg-gray-200/80'}`}
              >
                <FileText className="h-4 w-4" />
                <span>document</span>
              </button>
            </div>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform duration-200 hover:text-gray-600 
          ${showNav ? 'rotate-180' : ''}`} />
      </div>

      <div className="flex-1">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="meeting title"
          className="w-full text-2xl font-bold bg-transparent focus:outline-none px-3 py-2"
        />
        {showInvalidTime && (
          <div className="absolute top-2 right-2 bg-red-100 text-red-600 px-2 py-1 rounded text-xs">
            invalid time format
          </div>
        )}

        {viewMode === 'timeline' ? (
          <div 
            ref={scrollRef}
            onScroll={onScroll}
            className="flex-1 overflow-y-auto p-3 space-y-3"
          >
            {sortedNotes.map(note => (
              <div 
                key={note.id} 
                onClick={() => !editingId && onTimeClick(note.timestamp)}
                className="text-sm mb-2 hover:bg-gray-100 active:bg-gray-200 transition-colors select-text cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {editingTime === note.id ? (
                      <div className="relative">
                        <input
                          ref={editTimeRef}
                          type="text"
                          id={`time-edit-${note.id}`}
                          name={`time-edit-${note.id}`}
                          value={editTimeText}
                          onChange={(e) => setEditTimeText(e.target.value)}
                          className="w-24 bg-white border rounded px-1 py-0.5 focus:outline-none text-xs text-gray-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              updateTime(note.id)
                            }
                            if (e.key === 'Escape') {
                              setEditingTime(null)
                            }
                          }}
                        />
                        <div className="absolute -bottom-4 left-0 text-[10px] text-gray-500">
                          format: HH:MM:SS
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-xs hover:underline">
                        {note.timestamp.toLocaleTimeString()}
                      </span>
                    )}
                    {!editingTime && (
                      <button
                        onClick={(e) => startEditingTime(note, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200 rounded text-xs text-gray-500 px-1"
                      >
                        edit
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {note.editedAt && (
                      <span className="text-gray-400 text-xs">
                        edited {note.editedAt.toLocaleTimeString()}
                      </span>
                    )}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        await handleImprove(note)
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200 rounded text-xs text-gray-500 px-2 py-0.5"
                    >
                      improve
                    </button>
                  </div>
                </div>
                {editingId === note.id ? (
                  <div 
                    ref={editRef}
                    className="mt-1"
                  >
                    <input
                      type="text"
                      id={`note-edit-${note.id}`}
                      name={`note-edit-${note.id}`}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full bg-gray-50 border rounded px-2 py-1 focus:outline-none font-mono text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          updateNote()
                        }
                        if (e.key === 'Escape') {
                          setEditingId(null)
                        }
                      }}
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      press Enter to save • Esc to discard
                    </div>
                  </div>
                ) : (
                  <div 
                    className="mt-1 cursor-text hover:bg-gray-50 transition-colors rounded"
                    onClick={(e) => {
                      e.stopPropagation()
                      startEditing(note, e)
                    }}
                  >
                    {note.text}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <TextEditor 
            notes={sortedNotes}
            setNotes={(newNotes: Note[]) => setNotes(newNotes)}
            scrollRef={scrollRef}
            onScroll={onScroll}
            isEditing={true}
            analysis={analysis?.summary ? {
              summary: analysis.summary,
              facts: [],
              events: [],
              flow: [],
              decisions: []
            } : null}
          />
        )}

        {!isScrolledToBottom && (
          <button
            onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
            className="absolute bottom-20 right-4 p-2 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}

        {viewMode === 'timeline' && (
          <form onSubmit={sendMessage} className="p-2 bg-gray-100">
            <input
              type="text"
              id="new-note"
              name="new-note"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              className="flex-1 px-2 py-1.5 bg-transparent focus:outline-none text-sm"
              placeholder="type a note..."
            />
          </form>
        )}
      </div>
    </div>
  )
} 