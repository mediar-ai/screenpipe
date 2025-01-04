import { useWindowEventLister } from '@/modules/event-management/listener/adapters/react/window.hook'
import { ReactLogPresenterOutput } from '@/modules/screenpipe-cli/adapters/react-log.presenter'
import React from 'react'
import { useState, useCallback, useRef, useEffect } from 'react'

export function useTerminalTextDisplay(initialLines: string[] = []) {
  const [lines, setLines] = useState<string[]>(initialLines)
  const bottomRef = useRef<HTMLDivElement>(null)

  const addLine = useCallback((newLine: string) => {
    setLines((prevLines) => [...prevLines, newLine])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return { lines, addLine, bottomRef }
}

interface TextDisplayProps {
  initialLines?: string[]
}

export const TerminalTextDisplay: React.FC<TextDisplayProps> = ({ initialLines = [] }) => {
  const { lines, addLine, bottomRef } = useTerminalTextDisplay(initialLines)
  
  const handleNewLog = useCallback((event: ReactLogPresenterOutput) => {
    console.log({event})
    // if (event.message) {
    //   addLine(inputText.trim())
    // }
  },[])

  useWindowEventLister('model-download-update', handleNewLog)

  return (
    <div className="h-[100px] w-[500px] max-w-2xl mx-auto p-4">
        {lines.map((line, index) => (
            <div key={index} className="text-gray-800">
                {line}
            </div>
        ))}
        <div ref={bottomRef} />
    </div>
  )
}

