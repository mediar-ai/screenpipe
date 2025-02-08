'use client'

import { useRouter } from 'next/navigation'
import { LiveTranscription } from '@/components/live-transcription/new-meeting-wrapper'
import { useEffect, useRef } from 'react'
import { MeetingProvider } from '@/components/live-transcription/hooks/storage-for-live-meeting'

export default function LiveMeetingPage() {
  const router = useRouter()
  const mounted = useRef(false)
  
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    
    console.log('live meeting page mounting, pathname:', window.location.pathname)
    
    return () => {
      console.log('live meeting page unmounting')
      mounted.current = false
    }
  }, [])
  
  return (
    <div className="h-full">
      <MeetingProvider>
        <LiveTranscription 
          onBack={() => {
            console.log('live meeting back pressed')
            router.push('/meetings')
          }} 
        />
      </MeetingProvider>
    </div>
  )
}