import { toast } from "@/hooks/use-toast"
import { archiveLiveMeeting, clearLiveMeetingData } from "@/components/live-transcription/hooks/storage-for-live-meeting"
import type { LiveMeetingData } from "@/components/live-transcription/hooks/storage-for-live-meeting"

export async function handleStartNewMeeting(currentData?: LiveMeetingData | null) {
  console.log('starting new meeting')
  try {
    if (currentData) {
      // Take a snapshot of current data to prevent race conditions
      const meetingSnapshot = {
        ...currentData,
        startTime: currentData.startTime || new Date().toISOString(),
        endTime: new Date().toISOString()
      }

      console.log('current meeting state:', {
        title: currentData.title,
        notes_count: currentData.notes?.length,
        has_analysis: !!currentData.analysis,
        data_state: {
          start_time: meetingSnapshot.startTime,
          end_time: meetingSnapshot.endTime
        }
      })

      // Archive current meeting state
      const archived = await archiveLiveMeeting()
      if (!archived) {
        throw new Error("failed to archive meeting")
      }
      
      // Clear storage
      await clearLiveMeetingData()
      
      // Wait to ensure storage is cleared
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    // Try window.location first, fallback to router
    try {
      window.location.href = '/meetings/live'
      return true
    } catch (error) {
      console.error('failed to navigate with window.location:', error)
      return false // caller should use router.push as fallback
    }
    
  } catch (error) {
    console.error('failed to start new meeting:', error)
    toast({
      title: "error",
      description: "failed to start new meeting. please try again",
      variant: "destructive",
    })
    return false
  }
} 