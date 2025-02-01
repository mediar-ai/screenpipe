"use client"

import { useState, useEffect } from "react"
import { Meeting } from "./types"
import { useMeetings } from "./hooks/use-meetings"
import { MeetingCard } from "./components/meeting-card"
import { Button } from "@/components/ui/button"
import { Loader2, PlusCircle, Settings as SettingsIcon } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { LiveTranscription } from "@/components/live-transcription/new-meeting-wrapper"
import { useRouter } from "next/navigation"
import { MeetingSettings } from "./components/meeting-settings"
import { UpcomingMeetings } from "./components/mockup-upcoming-meetings"
import { getLiveMeetingData, clearLiveMeetingData } from "@/components/live-transcription/hooks/storage-for-live-meeting"

export function MeetingHistory() {
  const { meetings, loading, error, updateMeetings } = useMeetings()
  const { toast } = useToast()
  const [showLiveTranscription, setShowLiveTranscription] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [windowHeight, setWindowHeight] = useState(0)
  const [hasLiveMeeting, setHasLiveMeeting] = useState(false)
  const router = useRouter()

  const updateHeight = () => {
    const vh = window.innerHeight
    const headerOffset = 32 // 2rem for top padding
    console.log('meeting list height:', vh, 'header offset:', headerOffset)
    setWindowHeight(vh - headerOffset)
  }

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

  const handleNewMeeting = async () => {
    if (hasLiveMeeting) {
      console.log('existing meeting detected, prompting user')
      const confirmed = window.confirm('You have an existing meeting in progress. Start a new one anyway?')
      if (!confirmed) {
        console.log('user chose to resume existing meeting')
        setShowLiveTranscription(true)
        return
      }
      console.log('user chose to start new meeting, clearing existing data')
      await clearLiveMeetingData()
    }
    console.log('starting new meeting')
    setShowLiveTranscription(true)
  }

  if (showSettings) {
    return <MeetingSettings onBack={() => setShowSettings(false)} />
  }

  if (showLiveTranscription) {
    console.log('showing live transcription view')
    return <LiveTranscription onBack={() => {
      console.log('returning from live transcription to meeting history')
      setShowLiveTranscription(false)
    }} />
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
          <Button
            onClick={hasLiveMeeting ? () => setShowLiveTranscription(true) : handleNewMeeting}
            variant="default"
            size="sm"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            {hasLiveMeeting ? 'resume meeting' : 'new meeting'}
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
            <div className="bg-accent/50 rounded-lg">
              <h3 className="text-xl font-semibold mb-6 text-muted-foreground pl-4">upcoming</h3>
              <UpcomingMeetings />
            </div>
            
            <div>
              {Object.entries(groupMeetingsByDate(meetings)).map(([date, dateMeetings]) => (
                <div key={date}>
                  <h3 className="text-xl font-semibold mb-3 text-muted-foreground">{date}</h3>
                  {dateMeetings.map((meeting) => (
                    <MeetingCard
                      key={meeting.id}
                      meeting={meeting}
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