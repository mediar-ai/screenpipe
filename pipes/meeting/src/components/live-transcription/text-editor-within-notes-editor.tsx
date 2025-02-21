'use client'

import { Note } from '../meeting-history/types'
import { RefObject, UIEvent, useState, useRef, useEffect } from 'react'
import { MeetingAnalysis } from './hooks/ai-create-all-notes'
import { ChunkOverlay } from './floating-container-buttons'
import { useSettings } from "@/lib/hooks/use-settings"
import { useMeetingContext } from './hooks/storage-for-live-meeting'
import { useTextEditorAutoScroll } from './hooks/text-editor-auto-scroll'

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

  // Add local state for text content
  const [localText, setLocalText] = useState('')
  const textDebounceRef = useRef<NodeJS.Timeout>()
  const initializedRef = useRef(false)
  
  const { 
    textareaRef, 
    onScroll: autoScrollOnScroll, 
    isScrolledToBottom,
    scrollToBottom 
  } = useTextEditorAutoScroll()
  
  // Update localText whenever notes change
  useEffect(() => {
    // console.log('text-editor: notes updated', { 
    //   notesCount: notes.length,
    //   lastNote: notes[notes.length - 1]?.text?.slice(0, 50),
    //   isInitialized: initializedRef.current
    // })

    const text = notes
      .map(note => {
        const text = note.text || ''
        // Use bullet point if the note text starts with "- "
        return text.startsWith('- ') ? '• ' + text.slice(2) : text
      })
      .join('\n')

    // Always update localText when notes change
    setLocalText(text)
    
    // Mark as initialized if not already
    if (!initializedRef.current) {
      initializedRef.current = true
    }
  }, [notes]) // React to notes changes

  // Auto-scroll when content changes
  useEffect(() => {
    if (isScrolledToBottom) {
      scrollToBottom()
    }
  }, [localText, isScrolledToBottom])

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

        setLocalText(newText)
        const newNotes = newText.split('\n').map(createNote)
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
        setLocalText(newText)
        return
      }

      // Add new line with bullet if current line has bullet
      const insertion = isList ? '\n• ' : '\n'
      const newText = text.slice(0, selectionStart) + insertion + text.slice(selectionStart)
      setLocalText(newText)
      
      // Move cursor after the bullet
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + insertion.length
      }, 0)
    }
  }

  const createNote = (text: string): Note => ({
    id: crypto.randomUUID(),
    text: text.startsWith('• ') ? '- ' + text.slice(2) : text,
    timestamp: new Date(),
    isInput: true,
    device: 'keyboard',
    editedAt: undefined
  })


  return (
    <div 
      ref={scrollRef}
      className="flex flex-col h-full"
    >
      <textarea
        ref={textareaRef}
        onScroll={autoScrollOnScroll}
        value={localText}
        onChange={(e) => {
          const newValue = e.target.value
          // console.log('textarea onChange:', { newValue: e.target.value });
          setLocalText(newValue)
          
          if (textDebounceRef.current) {
            clearTimeout(textDebounceRef.current)
          }
          
          textDebounceRef.current = setTimeout(() => {
            const newNotes = newValue.split('\n')
                .filter(text => text.trim())
                .map(createNote)
            console.log('creating new notes:', {
                oldLength: notes.length,
                newLength: newNotes.length,
                sample: newNotes[0]?.text?.slice(0, 50)
            })
            setNotes(newNotes)
          }, 500)
        }}
        onBlur={() => {
          const currentNotes = notes.map(n => n.text).join('\n')
          if (localText.trim() !== currentNotes.trim()) {
            console.log('committing text on blur')
            const newNotes = localText.split('\n')
                .filter(text => text.trim())
                .map(createNote)
            setNotes(newNotes)
          }
        }}
        onKeyDown={handleKeyDown}
        className="flex-1 w-full p-3 resize-none focus:outline-none bg-transparent overflow-y-auto"
        placeholder="type your notes..."
        autoFocus={isEditing}
      />
    </div>
  )
} 