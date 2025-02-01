'use client'

import { Note } from './types'
import { RefObject, UIEvent, useEffect, useState } from 'react'
import { MeetingAnalysis } from './hooks/ai-create-all-notes'
import { ChunkOverlay } from './floating-container-buttons'
import { useSettings } from "@/lib/hooks/use-settings"
import { useMeetingContext } from './hooks/storage-for-live-meeting'
import { improveNote } from "./hooks/ai-create-note"

interface TextEditorProps {
  notes: Note[]
  setNotes: (notes: Note[]) => void
  scrollRef?: RefObject<HTMLDivElement>
  onScroll?: (e: UIEvent<HTMLDivElement>) => void
  isEditing?: boolean
  analysis?: MeetingAnalysis | null
}

export function TextEditor({ 
  notes, 
  setNotes, 
  scrollRef, 
  onScroll, 
  isEditing = false,
  analysis 
}: TextEditorProps) {
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null)

  const { settings } = useSettings()
  const { title, segments } = useMeetingContext()

  const handleMouseMove = (e: React.MouseEvent, noteId: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHoverX(e.clientX - rect.left)
    setHoveredNoteId(noteId)
  }

  const handleMouseLeave = () => {
    setHoverX(null)
    setHoveredNoteId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle bold text (Ctrl/Cmd + B)
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault()
      const textarea = e.currentTarget
      const { selectionStart, selectionEnd } = textarea
      const text = textarea.value

      // If there's selected text, wrap it with bold syntax
      if (selectionStart !== selectionEnd) {
        const newText = 
          text.slice(0, selectionStart) + 
          '**' + text.slice(selectionStart, selectionEnd) + '**' + 
          text.slice(selectionEnd)

        const newNotes = newText.split('\n').map(text => ({
          id: crypto.randomUUID(),
          text,
          timestamp: new Date(),
          isInput: true,
          device: 'keyboard'
        }))
        setNotes(newNotes)

        // Maintain selection including the markdown syntax
        setTimeout(() => {
          textarea.selectionStart = selectionStart + 2
          textarea.selectionEnd = selectionEnd + 2
        }, 0)
        return
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const textarea = e.currentTarget
      const { selectionStart } = textarea
      const text = textarea.value
      
      // Get the current line
      const lastNewLine = text.lastIndexOf('\n', selectionStart - 1)
      const currentLine = text.slice(lastNewLine + 1, selectionStart)
      
      // Check if current line starts with "• " or "- "
      const isList = currentLine.trimStart().startsWith('• ') || currentLine.trimStart().startsWith('- ')
      
      // If current line is empty and has bullet, remove the bullet
      if (currentLine.trim() === '•' || currentLine.trim() === '-') {
        const newText = text.slice(0, lastNewLine + 1) + text.slice(selectionStart)
        const newNotes = newText.split('\n').map(text => ({
          id: crypto.randomUUID(),
          text,
          timestamp: new Date(),
          isInput: true,
          device: 'keyboard'
        }))
        setNotes(newNotes)
        return
      }

      // Add new line with bullet if current line has bullet
      const insertion = isList ? '\n• ' : '\n'
      const newText = text.slice(0, selectionStart) + insertion + text.slice(selectionStart)
      const newNotes = newText.split('\n').map(text => ({
        id: crypto.randomUUID(),
        text: text.startsWith('- ') ? '• ' + text.slice(2) : text,
        timestamp: new Date(),
        isInput: true,
        device: 'keyboard'
      }))
      setNotes(newNotes)
      
      // Move cursor after the bullet
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + insertion.length
      }, 0)
    }
  }

  const handleImprove = async (note: Note) => {
    // Add debug logging for settings
    console.log("improving note with settings:", {
      aiProviderType: settings.aiProviderType,
      hasToken: !!settings.user?.token,
      hasOpenAIKey: !!settings.openaiApiKey,
      aiUrl: settings.aiUrl
    })
    
    // Get the last segment's timestamp - parse ISO string to Date
    const lastSegmentTime = segments.length > 0 
      ? new Date(segments[segments.length - 1].timestamp).getTime()
      : 0

    // If note is after the last segment, use all segments combined
    if (note.timestamp.getTime() > lastSegmentTime) {
      console.log("note is after last segment, using all segments")
      const combinedText = segments
        .map(s => `[${s.speaker?.name ?? 'unknown'}]: ${s.transcription}`)
        .join('\n')

      const improved = await improveNote({
        note,
        chunk: {
          text: combinedText,
          speaker: 'combined',
          timestamp: note.timestamp
        },
        title
      }, settings)

      const newNotes = notes.map(n => 
        n.id === note.id ? { ...n, text: improved } : n
      )
      setNotes(newNotes)
      return
    }

    // Original logic for notes during the meeting
    const relevantSegment = segments
      .filter(s => new Date(s.timestamp).getTime() <= note.timestamp.getTime())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]

    if (!relevantSegment) {
      console.log("no relevant segment found for note")
      return
    }

    console.log("selected segment for improvement:", {
      note_timestamp: note.timestamp,
      segment_timestamp: new Date(relevantSegment.timestamp),
      segment_text: relevantSegment.transcription,
      segment_speaker: relevantSegment.speaker?.name
    })

    const improved = await improveNote({
      note,
      chunk: {
        text: relevantSegment.transcription,
        speaker: relevantSegment.speaker?.name,
        timestamp: new Date(relevantSegment.timestamp)
      },
      title
    }, settings)

    // Update the note with improved content
    const newNotes = notes.map(n => 
      n.id === note.id ? { ...n, text: improved } : n
    )
    setNotes(newNotes)
  }

  const combinedText = notes
    .map(note => note.text.startsWith('- ') ? '• ' + note.text.slice(2) : note.text)
    .join('\n')

  return (
    <div 
      ref={scrollRef}
      onScroll={onScroll}
      className="flex flex-col h-full"
    >
      <textarea
        value={combinedText}
        onChange={(e) => {
          const newNotes = e.target.value.split('\n').map(text => ({
            id: crypto.randomUUID(),
            text: text.startsWith('• ') ? '- ' + text.slice(2) : text,
            timestamp: new Date(),
            isInput: true,
            device: 'keyboard'
          }))
          setNotes(newNotes)
        }}
        onKeyDown={handleKeyDown}
        className="flex-1 w-full p-3 resize-none focus:outline-none bg-transparent overflow-y-auto"
        placeholder="type your notes..."
        autoFocus={isEditing}
      />
    </div>
  )
} 