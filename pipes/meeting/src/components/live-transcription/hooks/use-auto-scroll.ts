import { useEffect, useRef, useState } from 'react'
import { TranscriptionChunk } from '../types'

export function useAutoScroll(chunks: TranscriptionChunk[]) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const lastStateRef = useRef(true)

  const scrollToBottom = () => {
    const element = scrollRef.current
    if (!element) {
      console.log('no scroll element found')
      return
    }

    // Use requestAnimationFrame to ensure content is rendered
    requestAnimationFrame(() => {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: 'smooth'
      })
    })
  }

  // Handle scroll events
  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return

    const isAtBottom = 
      Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) < 50
    
    if (isAtBottom !== lastStateRef.current) {
      console.log('auto-scroll:', isAtBottom ? 'enabled' : 'disabled')
      lastStateRef.current = isAtBottom
    }
    
    setShouldAutoScroll(isAtBottom)
  }

  // Auto-scroll when new chunks arrive
  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom()
    }
  }, [chunks, shouldAutoScroll])

  return { scrollRef, onScroll, isScrolledToBottom: shouldAutoScroll }
} 