"use client"

import { useState, useEffect } from "react"
import { MeetingCard } from "./components/meeting-card"
import { Button } from "@/components/ui/button"
import { Loader2, PlusCircle, Settings as SettingsIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { MeetingSettings } from "./components/meeting-settings"
import { 
  getLiveMeetingData, 
  clearLiveMeetingData,
  getArchivedLiveMeetings,
  LiveMeetingData,
  deleteArchivedMeeting,
  updateArchivedMeeting
} from "@/components/live-transcription/hooks/storage-for-live-meeting"
import { useSettings } from "@/lib/hooks/use-settings"
import { MeetingAnalysis } from "@/components/live-transcription/hooks/ai-create-all-notes"

export function MeetingHistory() {
  const [mounted, setMounted] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [windowHeight, setWindowHeight] = useState(0)
  const [hasLiveMeeting, setHasLiveMeeting] = useState(false)
  const [archivedMeetings, setArchivedMeetings] = useState<LiveMeetingData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const { settings } = useSettings()
  const router = useRouter()

  const handleResume = async () => {
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
  }

  const handleNewMeeting = async () => {
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
  }

  const handleDelete = async (meeting: LiveMeetingData) => {
    try {
      const confirmed = window.confirm('Are you sure you want to delete this meeting?')
      if (!confirmed) {
        console.log('meeting deletion cancelled by user')
        return
      }

      console.log('deleting meeting:', {
        title: meeting.title,
        startTime: meeting.startTime
      })
      await deleteArchivedMeeting(meeting.startTime)
      
      // Refresh the meetings list
      setRefreshTrigger(prev => prev + 1)
    } catch (error) {
      console.error('failed to delete meeting:', error)
    }
  }

  const handleUpdate = async (id: string, update: { 
    aiName?: string; 
    aiSummary?: string;
    analysis?: MeetingAnalysis | null;
  }) => {
    try {
      console.log('updating meeting:', {
        id,
        update,
        currentMeetings: archivedMeetings.length
      })

      // Create updates object
      const updates: Partial<LiveMeetingData> = {
        title: update.aiName,
        analysis: update.analysis
      }

      // Use the ID directly, no need to add prefix
      await updateArchivedMeeting(id, updates)
      
      // Refresh the meetings list
      const updated = await getArchivedLiveMeetings()
      setArchivedMeetings(updated)

    } catch (error) {
      console.error('failed to update meeting:', error)
    }
  }

  useEffect(() => {
    const loadMeetings = async () => {
      setLoading(true)
      try {
        const archived = await getArchivedLiveMeetings()
        console.log('loaded archived meetings:', {
          count: archived.length,
          latest: archived[0]?.title
        })
        setArchivedMeetings(archived)
      } catch (error) {
        console.error('failed to load archived meetings:', error)
      } finally {
        setLoading(false)
      }
    }
    loadMeetings()
  }, [refreshTrigger])

  useEffect(() => {
    const checkLiveMeeting = async () => {
      const liveData = await getLiveMeetingData()
      setHasLiveMeeting(!!liveData)
    }
    checkLiveMeeting()
  }, [])

  useEffect(() => {
    const updateHeight = () => {
      const vh = window.innerHeight
      const headerOffset = 32
      setWindowHeight(vh - headerOffset)
    }
    
    updateHeight()
    window.addEventListener('resize', updateHeight)
    setMounted(true)
    
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

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
          meeting history
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
        <div className="space-y-6">
          {Object.entries(groupMeetingsByDate(archivedMeetings)).map(([date, meetings]) => (
            <div key={date}>
              <h3 className="text-xl font-semibold mb-3 text-muted-foreground">{date}</h3>
              {meetings.map((meeting) => (
                <MeetingCard
                  key={`${meeting.startTime}-${meeting.title || 'untitled'}-${Math.random()}`}
                  meeting={meeting}
                  settings={settings}
                  onDelete={() => handleDelete(meeting)}
                  onUpdate={handleUpdate}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function groupMeetingsByDate(meetings: LiveMeetingData[]): Record<string, LiveMeetingData[]> {
  return meetings.reduce((groups, meeting) => {
    const date = new Date(meeting.startTime).toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })
    
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(meeting)
    return groups
  }, {} as Record<string, LiveMeetingData[]>)
}