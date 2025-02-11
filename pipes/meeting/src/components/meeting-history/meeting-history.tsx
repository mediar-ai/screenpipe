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
  useMeetingContext,
  archiveLiveMeeting
} from "@/components/live-transcription/hooks/storage-for-live-meeting"
import { useSettings } from "@/lib/hooks/use-settings"
import { MeetingAnalysis } from "@/components/live-transcription/hooks/ai-create-all-notes"
import { handleStartNewMeeting } from "@/components/meeting-history/meeting-utils"
import { toast } from "@/hooks/use-toast"

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


  const handleNewMeeting = async () => {
    const success = await handleStartNewMeeting()
    if (!success) {
        router.push('/meetings/live')
    }
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

    try {
        // First check if we're already viewing this archived meeting
        const currentMeeting = await getLiveMeetingData()
        if (currentMeeting?.isArchived && currentMeeting.id === meeting.id) {
            console.log('already viewing this archived meeting, just navigating')
            router.push('/meetings/live')
            return
        }

        // If viewing a different meeting (archived or live), handle appropriately
        if (currentMeeting) {
            if (currentMeeting.isArchived) {
                // Just clear if it's a different archived meeting
                await clearLiveMeetingData()
            } else {
                // Archive if it's a live meeting
                const archived = await archiveLiveMeeting()
                console.log('archived current meeting:', { success: archived })
                if (!archived) {
                    throw new Error("failed to archive current meeting")
                }
            }
        }
        
        // Wait to ensure storage is cleared
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Store the archived meeting with isArchived flag
        console.log('attempting to store meeting:', {
            id: meeting.id,
            chunks: meeting.chunks?.length,
            notes: meeting.notes?.length,
            isArchived: true
        })
        const stored = await updateStore({
            ...meeting,
            isArchived: true
        })
        console.log('store update result:', { success: !!stored })
        
        if (!stored) {
            throw new Error("failed to store archived meeting")
        }
        
        router.push('/meetings/live')
    } catch (error) {
        console.error('failed to load archived meeting:', error)
        toast({
            title: "error",
            description: "failed to load archived meeting. please try again",
            variant: "destructive",
        })
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
          {liveMeeting && !liveMeeting.isArchived && (
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