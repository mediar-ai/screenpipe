import { toast } from "@/hooks/use-toast"
import { archiveLiveMeeting } from "@/components/live-transcription/hooks/storage-for-live-meeting"
import type { LiveMeetingData } from "@/components/live-transcription/hooks/storage-for-live-meeting"
import { meetingStore } from "@/components/live-transcription/hooks/storage-for-live-meeting"

export async function handleStartNewMeeting(currentData?: LiveMeetingData | null) {
    console.log('starting new meeting:', {
        hasCurrentData: !!currentData,
        currentTitle: currentData?.title,
        isArchived: currentData?.isArchived
    })

    try {
        // 1. Archive current meeting if exists and not archived
        if (currentData && !currentData.isArchived) {
            const archived = await archiveLiveMeeting()
            if (!archived) {
                throw new Error("failed to archive current meeting")
            }
        }

        // 2. Create new meeting data
        const startTime = new Date().toISOString()
        const newData: LiveMeetingData = {
            id: `live-meeting-${startTime}`,
            chunks: [],
            mergedChunks: [],
            editedMergedChunks: {},
            speakerMappings: {},
            lastProcessedIndex: -1,
            startTime,
            title: null,
            notes: [],
            analysis: null,
            deviceNames: new Set<string>(),
            selectedDevices: new Set<string>(),
            isArchived: false,
            isAiNotesEnabled: true
        }

        // 3. Store new meeting and wait for confirmation
        await meetingStore.setItem(newData.id, newData)
        
        // 4. Use window.location for a full page reload to ensure clean state
        window.location.href = '/meetings/live'
        return true

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

export async function handleLoadMeeting(meeting: LiveMeetingData) {
    console.log('loading meeting:', {
        id: meeting.id,
        title: meeting.title,
        isArchived: meeting.isArchived
    })

    try {
        // 1. Archive current meeting if exists
        const archived = await archiveLiveMeeting()
        if (!archived) {
            console.log('no active meeting to archive')
        }

        // 2. Unarchive and update the target meeting
        const updatedMeeting = {
            ...meeting,
            isArchived: false
        }
        await meetingStore.setItem(meeting.id, updatedMeeting)

        // 3. Force a full page reload to ensure clean state
        window.location.href = '/meetings/live?from=archive'
        return true

    } catch (error) {
        console.error('failed to load meeting:', error)
        toast({
            title: "error",
            description: "failed to load meeting. please try again",
            variant: "destructive",
        })
        return false
    }
} 