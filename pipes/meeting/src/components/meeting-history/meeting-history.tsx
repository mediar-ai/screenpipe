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
  updateArchivedMeeting,
  useMeetingContext
} from "@/components/live-transcription/hooks/storage-for-live-meeting"
import { useSettings } from "@/lib/hooks/use-settings"
import { MeetingAnalysis } from "@/components/live-transcription/hooks/ai-create-all-notes"
import { handleStartNewMeeting } from "@/components/meeting-history/meeting-utils"

export function MeetingHistory() {
  const [mounted, setMounted] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [windowHeight, setWindowHeight] = useState(0)
  const [hasLiveMeeting, setHasLiveMeeting] = useState(false)
  const [liveMeeting, setLiveMeeting] = useState<LiveMeetingData | null>(null)
  const [archivedMeetings, setArchivedMeetings] = useState<LiveMeetingData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const { settings } = useSettings()
  const router = useRouter()
  const { updateStore } = useMeetingContext()

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
        router.push('/meetings/live')
        return
      }
    }

    const success = await handleStartNewMeeting(liveMeeting)
    if (!success) {
      router.push('/meetings/live')
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
        currentMeetings: archivedMeetings.length,
        isLive: id === liveMeeting?.id
      })

      // Handle live meeting
      if (liveMeeting && id === liveMeeting.id) {
        await updateStore({
          ...liveMeeting,
          title: update.aiName ?? liveMeeting.title,
          analysis: update.analysis ?? liveMeeting.analysis
        })
        return
      }

      // Handle archived meeting
      await updateArchivedMeeting(id, {
        title: update.aiName,
        analysis: update.analysis
      })
      
      // Refresh archived meetings list
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
        // Load both live and archived meetings
        const [live, archived] = await Promise.all([
          getLiveMeetingData(),
          getArchivedLiveMeetings()
        ])
        
        console.log('loaded meetings:', {
          hasLive: !!live,
          liveTitle: live?.title,
          archivedCount: archived.length,
        })
        
        setLiveMeeting(live)
        setHasLiveMeeting(!!live)
        setArchivedMeetings(archived)
      } catch (error) {
        console.error('failed to load meetings:', error)
      } finally {
        setLoading(false)
      }
    }
    loadMeetings()
  }, [refreshTrigger])

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
          {/* Show live meeting if exists */}
          {liveMeeting && (
            <div>
              <h3 className="text-xl font-semibold mb-3 text-muted-foreground">Live</h3>
              <div className="relative">
                <div className="absolute -left-0 z-10 -top-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground bg-accent rounded px-1 border border-border/40">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    now
                  </div>
                </div>
                <MeetingCard
                  key={liveMeeting.id}
                  meeting={liveMeeting}
                  settings={settings}
                  onUpdate={handleUpdate}
                  isLive={true}
                />
              </div>
            </div>
          )}

          {/* Show archived meetings grouped by date */}
          {Object.entries(groupMeetingsByDate(archivedMeetings)).map(([date, meetings]) => (
            <div key={date}>
              <h3 className="text-xl font-semibold mb-3 text-muted-foreground">{date}</h3>
              {meetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
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