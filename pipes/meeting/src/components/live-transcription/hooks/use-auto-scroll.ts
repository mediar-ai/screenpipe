import { useEffect, useRef, useState } from 'react'
import { TranscriptionChunk } from '../types'

export function useAutoScroll(chunks: TranscriptionChunk[]) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

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
      console.log('scrolled to bottom:', {
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        scrollTop: element.scrollTop
      })
    })
  }

  // Handle scroll events
  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return

    const isAtBottom = 
      Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) < 50
    
    console.log('scroll event:', {
      isAtBottom,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollTop: element.scrollTop
    })
    
    setShouldAutoScroll(isAtBottom)
  }

  // Auto-scroll when new chunks arrive
  useEffect(() => {
    if (!shouldAutoScroll) {
      console.log('auto-scroll disabled')
      return
    }

    console.log('new chunks arrived, scrolling to bottom')
    scrollToBottom()
  }, [chunks, shouldAutoScroll])

  return { scrollRef, onScroll }
} 