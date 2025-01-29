'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Clock } from 'lucide-react'

interface Note {
  id: string
  text: string
  timestamp: Date
  editedAt?: Date
}

interface Props {
  onTimeClick: (timestamp: Date) => void
}

export function NotesEditor({ onTimeClick }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [currentMessage, setCurrentMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editingTime, setEditingTime] = useState<string | null>(null)
  const [editTimeText, setEditTimeText] = useState('')
  const [showInvalidTime, setShowInvalidTime] = useState(false)
  const editRef = useRef<HTMLDivElement>(null)
  const editTimeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (editingId && editRef.current && !editRef.current.contains(event.target as Node)) {
        // Save the current edit text before closing
        setNotes(prev => prev.map(note => 
          note.id === editingId 
            ? { ...note, text: editText.trim() }
            : note
        ))
        setEditingId(null)
      }
      if (editingTime && editTimeRef.current && !editTimeRef.current.contains(event.target as Node)) {
        updateTime(editingTime)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editingId, editText, editingTime, editTimeText])

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentMessage.trim()) return

    setNotes(prev => [...prev, {
      id: crypto.randomUUID(),
      text: currentMessage.trim(),
      timestamp: new Date()
    }])
    setCurrentMessage('')
  }

  const startEditing = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent timestamp click
    setEditingId(note.id)
    setEditText(note.text)
  }

  const updateNote = () => {
    if (!editingId) return
    setNotes(prev => prev.map(note => 
      note.id === editingId 
        ? { 
            ...note, 
            text: editText.trim(),
            editedAt: new Date()
          }
        : note
    ))
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

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }, [notes])

  const updateTime = (noteId: string) => {
    try {
      const [hours, minutes, seconds] = editTimeText.split(':').map(Number)
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) ||
          hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
        throw new Error('invalid time')
      }
      
      setNotes(prev => {
        const updated = prev.map(note => {
          if (note.id === noteId) {
            const newTime = new Date(note.timestamp)
            newTime.setHours(hours, minutes, seconds)
            return { ...note, timestamp: newTime }
          }
          return note
        })
        return updated
      })
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

  return (
    <div className="h-full flex flex-col border rounded-md bg-card">
      {showInvalidTime && (
        <div className="absolute top-2 right-2 bg-red-100 text-red-600 px-2 py-1 rounded text-xs">
          invalid time format
        </div>
      )}
      <div className="p-2 border-b">
        <span className="text-xs text-gray-500">notes</span>
      </div>
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              {note.editedAt && (
                <span className="text-gray-400 text-xs">
                  edited {note.editedAt.toLocaleTimeString()}
                </span>
              )}
            </div>
            {editingId === note.id ? (
              <div 
                ref={editRef}
                className="mt-1"
              >
                <input
                  type="text"
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

      {/* Input Area */}
      <form onSubmit={sendMessage} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            className="flex-1 rounded-full px-4 py-2 bg-gray-100 focus:outline-none font-mono text-sm"
            placeholder="type a note..."
          />
          <button 
            type="submit"
            className="bg-black text-white rounded-full px-4 py-2 text-sm"
          >
            save
          </button>
        </div>
      </form>
    </div>
  )
} 