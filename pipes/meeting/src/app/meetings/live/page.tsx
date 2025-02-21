'use client'

import { useRouter } from 'next/navigation'
import { LiveTranscription } from '@/components/live-transcription/new-meeting-wrapper'
import { useEffect, useRef } from 'react'

export default function LiveMeetingPage() {
  const router = useRouter()
  const mounted = useRef(false)
  
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    
    console.log('live meeting page mounting, pathname:', window.location.pathname)
    
    // Add resize listener for debug
    const handleResize = () => {
      console.log('window resized:', {
        width: window.innerWidth,
        height: window.innerHeight,
        isMobile: window.innerWidth < 768
      })
    }
    window.addEventListener('resize', handleResize)
    
    return () => {
      console.log('live meeting page unmounting')
      mounted.current = false
      window.removeEventListener('resize', handleResize)
    }
  }, [])
  
  return (
    <div className="h-full">
      <LiveTranscription />
    </div>
  )
}