import { toast } from "@/hooks/use-toast"
import { archiveLiveMeeting, clearLiveMeetingData } from "@/components/live-transcription/hooks/storage-for-live-meeting"
import type { LiveMeetingData } from "@/components/live-transcription/hooks/storage-for-live-meeting"

export async function handleStartNewMeeting(currentData?: LiveMeetingData | null) {
    console.log('handleStartNewMeeting: starting', {
        hasCurrentData: !!currentData,
        currentTitle: currentData?.title,
        isArchived: currentData?.isArchived
    })

    try {
        if (currentData && !currentData.isArchived) {
            // Take a snapshot of current data
            const meetingSnapshot = {
                ...currentData,
                startTime: currentData.startTime || new Date().toISOString(),
                endTime: new Date().toISOString(),
                isArchived: true // Ensure it's marked as archived
            }

            console.log('archiving current meeting:', {
                title: meetingSnapshot.title,
                notes: meetingSnapshot.notes?.length,
                chunks: meetingSnapshot.chunks?.length,
                startTime: meetingSnapshot.startTime,
                endTime: meetingSnapshot.endTime
            })

            // Archive current meeting state
            const archived = await archiveLiveMeeting()
            if (!archived) {
                throw new Error("failed to archive meeting")
            }
        }

        // Clear storage regardless of archiving result
        await clearLiveMeetingData()
        
        console.log('cleared meeting data, redirecting to /meetings/live')
        
        // Force reload to ensure clean state
        window.location.href = '/meetings/live'
        return true

    } catch (error) {
        console.error('handleStartNewMeeting failed:', error)
        toast({
            title: "error starting new meeting",
            description: "please try again or refresh the page",
            variant: "destructive",
        })
        return false
    }
} 