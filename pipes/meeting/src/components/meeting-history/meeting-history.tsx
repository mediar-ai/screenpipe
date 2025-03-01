"use client"

import { useState, useEffect } from "react"
import { MeetingCard } from "./components/meeting-card"
import { Button } from "@/components/ui/button"
import { Loader2, PlusCircle, Settings as SettingsIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { MeetingSettings } from "./components/meeting-settings"
import { 
  LiveMeetingData,
  deleteArchivedMeeting,
  updateArchivedMeeting,
  useMeetingContext,
  getAllMeetings,
} from "@/components/live-transcription/hooks/storage-for-live-meeting"
import { useSettings } from "@/lib/hooks/use-settings"
import { MeetingAnalysis } from "@/components/live-transcription/hooks/ai-create-all-notes"
import { handleStartNewMeeting } from "@/components/meeting-history/meeting-utils"
import { toast } from "@/hooks/use-toast"
import { handleLoadMeeting } from "@/components/meeting-history/meeting-utils"

export function MeetingHistory() {
  const [mounted, setMounted] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [windowHeight, setWindowHeight] = useState(0)
  const [archivedMeetings, setArchivedMeetings] = useState<LiveMeetingData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const { settings } = useSettings()
  const router = useRouter()

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
      })

      // Handle archived meeting
      await updateArchivedMeeting(id, {
        title: update.aiName,
        analysis: update.analysis
      })
      
      // Refresh archived meetings list
      const updated = await getAllMeetings()
      setArchivedMeetings(updated.filter(m => m.isArchived))

    } catch (error) {
      console.error('failed to update meeting:', error)
    }
  }

  const handleLoadArchived = async (meeting: LiveMeetingData) => {
    console.log('loading archived meeting details:', {
      id: meeting.id,
      isArchived: true,
      title: meeting.title,
      startTime: meeting.startTime,
      hasChunks: meeting.chunks?.length,
      hasNotes: meeting.notes?.length,
      hasAnalysis: !!meeting.analysis,
      deviceNames: [...(meeting.deviceNames || [])],
      selectedDevices: [...(meeting.selectedDevices || [])]
    })

    await handleLoadMeeting(meeting)
  }

  const handleDelete = async (meeting: LiveMeetingData) => {
    try {
      // Check if user has disabled delete confirmations
      const skipConfirm = localStorage.getItem('skipDeleteConfirm') === 'true'
      
      if (!skipConfirm) {
        const result = await new Promise<boolean>((resolve) => {
          const checkbox = document.createElement('input')
          checkbox.type = 'checkbox'
          checkbox.id = 'dontAskAgain'
          
          const message = document.createElement('div')
          message.innerHTML = `
            Are you sure you want to delete this meeting?
            <br/><br/>
            <label style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="dontAskAgain" />
              <span>don't ask again</span>
            </label>
          `
          
          const confirmed = window.confirm(message.innerText)
          const dontAskAgain = (document.getElementById('dontAskAgain') as HTMLInputElement)?.checked
          
          if (dontAskAgain) {
            localStorage.setItem('skipDeleteConfirm', 'true')
          }
          
          resolve(confirmed)
        })

        if (!result) {
          console.log('meeting deletion cancelled by user')
          return
        }
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

  const handleNewMeeting = async () => {
    await handleStartNewMeeting()
  }

  useEffect(() => {
    const loadMeetings = async () => {
      setLoading(true)
      try {
        const meetings = await getAllMeetings()
        console.log('loaded meetings:', {
          total: meetings.length,
          live: meetings.find(m => !m.isArchived)?.title
        })
        
        setArchivedMeetings(meetings.filter(m => m.isArchived))
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
                  onLoadArchived={() => handleLoadArchived(meeting)}
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