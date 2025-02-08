"use client"

import { useState, useEffect, useCallback } from "react"
import { Meeting } from "./types"
import { useMeetings } from "./hooks/use-meetings"
import { MeetingCard } from "./components/meeting-card"
import { Button } from "@/components/ui/button"
import { Loader2, PlusCircle, Settings as SettingsIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { MeetingSettings } from "./components/meeting-settings"
import { UpcomingMeetings } from "./components/mockup-upcoming-meetings"
import { getLiveMeetingData, clearLiveMeetingData } from "@/components/live-transcription/hooks/storage-for-live-meeting"
import { useSettings } from "@/lib/hooks/use-settings"

export function MeetingHistory() {
  const [mounted, setMounted] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [windowHeight, setWindowHeight] = useState(0)
  const [hasLiveMeeting, setHasLiveMeeting] = useState(false)

  const { meetings, loading, error, updateMeetings } = useMeetings()
  const { settings } = useSettings()
  const router = useRouter()

  const handleResume = useCallback(async () => {
    if (!hasLiveMeeting) return
    
    console.log('resume: attempting navigation to live meeting')
    try {
      const liveData = await getLiveMeetingData()
      console.log('resume: current live meeting state:', {
        hasTitle: !!liveData?.title,
        notesCount: liveData?.notes?.length,
        firstNote: liveData?.notes?.[0]?.text?.slice(0, 50)
      })
      await router.push('/meetings/live')
      console.log('resume: navigation completed')
    } catch (e) {
      console.error('resume: navigation failed:', e)
    }
  }, [hasLiveMeeting, router])

  const handleNewMeeting = useCallback(async () => {
    if (hasLiveMeeting) {
      console.log('existing meeting detected, prompting user')
      const confirmed = window.confirm('You have an existing meeting in progress. Start a new one anyway?')
      if (!confirmed) {
        console.log('user chose to resume existing meeting')
        await handleResume()
        return
      }
      console.log('user chose to start new meeting, clearing existing data')
      await clearLiveMeetingData()
    }
    console.log('starting new meeting')
    try {
      await router.push('/meetings/live')
      console.log('navigation completed')
    } catch (e) {
      console.error('navigation failed:', e)
    }
  }, [hasLiveMeeting, router, handleResume])

  useEffect(() => {
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  useEffect(() => {
    const checkLiveMeeting = async () => {
      const liveData = await getLiveMeetingData()
      console.log('checking for live meeting:', {
        exists: !!liveData,
        title: liveData?.title,
        notesCount: liveData?.notes?.length,
        hasAnalysis: !!liveData?.analysis
      })
      setHasLiveMeeting(!!liveData)
    }
    checkLiveMeeting()
  }, [])

  useEffect(() => {
    setMounted(true)
    console.log('meeting-history mounted')
  }, [])

  const updateHeight = () => {
    const vh = window.innerHeight
    const headerOffset = 32
    console.log('meeting list height:', vh, 'header offset:', headerOffset)
    setWindowHeight(vh - headerOffset)
  }

  const handleMeetingUpdate = (id: string, update: { aiName?: string; aiSummary?: string }) => {
    console.log('handling meeting update:', {
      meetingId: id,
      update,
      currentMeetingsCount: meetings.length
    })
    const updatedMeetings = meetings.map(meeting => {
      return meeting.id === id ? { ...meeting, ...update } : meeting
    })
    console.log('updated meetings count:', updatedMeetings.length)
    updateMeetings(updatedMeetings)
  }

  if (!mounted) return null
  
  if (showSettings) {
    return <MeetingSettings onBack={() => setShowSettings(false)} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-4" />
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-bold text-muted-foreground uppercase tracking-wider">
          meeting and conversation history
        </h2>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowSettings(true)}
            variant="outline"
            size="sm"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
          {hasLiveMeeting && (
            <Button
              onClick={handleResume}
              variant="outline"
              size="sm"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              resume meeting
            </Button>
          )}
          <Button
            onClick={handleNewMeeting}
            variant="default"
            size="sm"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            new meeting
          </Button>
        </div>
      </div>

      <div 
        className="w-full overflow-auto"
        style={{ height: windowHeight ? `${windowHeight}px` : '100vh' }}
      >
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-destructive">failed to load meetings</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* <div className="bg-accent/50 rounded-lg">
              <h3 className="text-xl font-semibold mb-6 text-muted-foreground pl-4">upcoming</h3>
              <UpcomingMeetings />
            </div> */}
            
            <div>
              {Object.entries(groupMeetingsByDate(meetings)).map(([date, dateMeetings]) => (
                <div key={date}>
                  <h3 className="text-xl font-semibold mb-3 text-muted-foreground">{date}</h3>
                  {dateMeetings.map((meeting) => (
                    <MeetingCard
                      key={meeting.id}
                      meeting={meeting}
                      settings={settings}
                      onUpdate={handleMeetingUpdate}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function groupMeetingsByDate(meetings: Meeting[]): Record<string, Meeting[]> {
  return meetings.reduce((groups, meeting) => {
    const date = new Date(meeting.meetingStart).toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })
    
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(meeting)
    return groups
  }, {} as Record<string, Meeting[]>)
}