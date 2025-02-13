import { useEffect, useRef, useState } from 'react'

export function useTextEditorAutoScroll() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const lastStateRef = useRef(true)
  const isUserScrolling = useRef(false)
  const scrollTimeout = useRef<NodeJS.Timeout>()

  const scrollToBottom = () => {
    const element = textareaRef.current
    if (!element || isUserScrolling.current) return

    // Use requestAnimationFrame to ensure content is rendered
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight
    })
  }

  const onScroll = () => {
    const element = textareaRef.current
    if (!element) return

    // Clear existing timeout
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current)
    }

    isUserScrolling.current = true

    // Check if we're near bottom (within 50px)
    const isAtBottom = 
      Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) < 50
    
    if (isAtBottom !== lastStateRef.current) {
      console.log('text-editor auto-scroll:', isAtBottom ? 'enabled' : 'disabled')
      lastStateRef.current = isAtBottom
    }
    
    setShouldAutoScroll(isAtBottom)

    // Reset user scrolling flag after 100ms of no scroll events
    scrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false
    }, 100)
  }

  return { 
    textareaRef, 
    onScroll, 
    isScrolledToBottom: shouldAutoScroll,
    scrollToBottom 
  }
} 