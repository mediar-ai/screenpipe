import { toast } from "@/hooks/use-toast"
import { archiveLiveMeeting } from "@/components/live-transcription/hooks/storage-for-live-meeting"
import type { LiveMeetingData } from "@/components/live-transcription/hooks/storage-for-live-meeting"

export async function handleStartNewMeeting(currentData?: LiveMeetingData | null) {
    console.log('handleStartNewMeeting: starting', {
        hasCurrentData: !!currentData,
        currentTitle: currentData?.title,
        isArchived: currentData?.isArchived
    })

    try {
        if (currentData && !currentData.isArchived) {
            console.log('archiving current meeting:', {
                title: currentData.title,
                notes: currentData.notes?.length,
                chunks: currentData.chunks?.length,
                startTime: currentData.startTime,
            })

            // Archive current meeting state - this will mark it as archived
            const archived = await archiveLiveMeeting()
            if (!archived) {
                throw new Error("failed to archive meeting")
            }
        }
        
        console.log('redirecting to /meetings/live for fresh meeting')
        
        // Force reload to ensure clean state - this will create a new meeting
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