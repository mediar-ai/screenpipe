import localforage from "localforage"
import { Meeting, MeetingUpdate } from "../types"
import { v4 as uuidv4 } from 'uuid'

// Initialize separate stores for different data types
const meetingsStore = localforage.createInstance({
  name: "meetings",
  storeName: "meetings"
})

const updatesStore = localforage.createInstance({
  name: "meetings",
  storeName: "updates"
})

// Add version constant at the top
const CURRENT_STORAGE_VERSION = 1

export async function setMeetings(meetings: Meeting[]): Promise<void> {
  try {
    // Assume meetings are already migrated when setting
    const meetingsToStore = meetings.map(m => ({
      ...m,
      _version: CURRENT_STORAGE_VERSION
    }))
    
    console.log("storing meetings to localforage:", meetingsToStore)
    await meetingsStore.setItem("meetings", meetingsToStore)
    // Verify the save worked
    const saved = await meetingsStore.getItem("meetings")
    console.log("verified saved meetings:", saved)
  } catch (error) {
    console.error("error setting meetings in storage:", error)
    throw error
  }
}

async function migrateMeetingData(meeting: any): Promise<Meeting> {
  // Detect old format by checking for legacy fields
  const needsMigration = 'name' in meeting || 'summary' in meeting || 'fullTranscription' in meeting
  
  if (!needsMigration) {
    // console.log('meeting already in current format:', meeting.id)
    return meeting as Meeting
  }

  console.log('migrating meeting data:', meeting)
  
  // Create a base meeting structure
  const migratedMeeting: Meeting = {
    id: meeting.id || uuidv4(),
    meetingStart: meeting.meetingStart,
    meetingEnd: meeting.meetingEnd,
    humanName: meeting.name || meeting.humanName || null,
    aiName: meeting.aiName || null,
    agenda: meeting.agenda || null,
    aiSummary: meeting.summary || meeting.aiSummary || null,
    participants: meeting.participants || null,
    mergedWith: meeting.mergedWith || [],
    selectedDevices: new Set(meeting.selectedDevices || []),
    deviceNames: new Set(meeting.deviceNames || []),
    segments: meeting.segments || [],
    notes: meeting.notes || [],
  }

  console.log('migrated meeting:', migratedMeeting)
  return migratedMeeting
}

export async function getMeetings(): Promise<Meeting[]> {
  try {
    const meetings = await meetingsStore.getItem<any[]>("meetings")
    const updates = await getAllUpdates()
    
    // Migrate and apply updates
    const migratedMeetings = await Promise.all(
      (meetings || []).map(async meeting => {
        const migrated = await migrateMeetingData(meeting)
        const update = updates[migrated.id]
        return update ? { ...migrated, ...update } : migrated
      })
    )

    // Store migrated format back to persist the changes
    if (meetings && meetings.length > 0) {
      console.log('persisting migrated meetings format')
      await setMeetings(migratedMeetings)
    }
    
    // Log storage stats
    const meetingsCount = migratedMeetings?.length || 0
    const updatesCount = Object.keys(updates).length
    const meetingsSize = new TextEncoder().encode(JSON.stringify(migratedMeetings)).length / 1024
    const updatesSize = new TextEncoder().encode(JSON.stringify(updates)).length / 1024

    console.log("storage stats:", {
      meetingsCount,
      updatesCount, 
      meetingsSize: `${meetingsSize.toFixed(2)}kb`,
      updatesSize: `${updatesSize.toFixed(2)}kb`,
      orphanedUpdates: Object.keys(updates).filter(id => !migratedMeetings?.some(m => m.id === id))
    })

    return migratedMeetings
  } catch (error) {
    console.error("error getting meetings from storage:", error)
    throw error
  }
}

export async function updateMeeting(id: string, update: Partial<MeetingUpdate>): Promise<void> {
  try {
    console.log('updating meeting:', id, update)
    const updates = await updatesStore.getItem<Record<string, MeetingUpdate>>("updates") || {}
    
    // Merge with existing updates
    updates[id] = {
      ...updates[id],
      ...update,
      id
    }
    
    await updatesStore.setItem("updates", updates)
    console.log('stored update:', updates[id])
  } catch (error) {
    console.error("error updating meeting:", error)
    throw error
  }
}

export async function getAllUpdates(): Promise<Record<string, MeetingUpdate>> {
  try {
    return await updatesStore.getItem("updates") || {}
  } catch (error) {
    console.error("error getting updates:", error)
    return {}
  }
}

export async function clearMeetings(): Promise<void> {
  try {
    await Promise.all([
      meetingsStore.clear(),
      updatesStore.clear()
    ])
    console.log("meetings and updates cleared from storage")
  } catch (error) {
    console.error("error clearing meetings:", error)
    throw error
  }
}

export async function cleanupOldMeetings(keepCount: number = 10): Promise<void> {
  try {
    const meetings = await getMeetings()
    const meetingsToKeep = meetings.slice(-keepCount)
    await setMeetings(meetingsToKeep)
    
    // Cleanup updates for removed meetings
    const updates = await getAllUpdates()
    const keepIds = new Set(meetingsToKeep.map(m => m.id))
    const updatesToKeep = Object.entries(updates)
      .filter(([id]) => keepIds.has(id))
      .reduce((acc, [id, update]) => ({ ...acc, [id]: update }), {})
    
    await updatesStore.setItem("updates", updatesToKeep)
    console.log(`cleaned up storage, keeping last ${keepCount} meetings`)
  } catch (error) {
    console.error("error cleaning up old meetings:", error)
    throw error
  }
}

export async function createMeeting(meeting: Omit<Meeting, 'id'>): Promise<Meeting> {
  console.log('creating new meeting with data:', {
    meetingStart: meeting.meetingStart,
    selectedDevices: Array.from(meeting.selectedDevices),
    deviceNames: Array.from(meeting.deviceNames),
    segmentsCount: meeting.segments.length
  })

  const newMeeting: Meeting = {
    ...meeting,
    id: uuidv4(),
    humanName: null,
    aiName: null,
    aiSummary: null,
    notes: [],
  }

  const meetings = await getMeetings()
  await setMeetings([...meetings, newMeeting])
  
  console.log('created new meeting:', {
    id: newMeeting.id,
    meetingStart: newMeeting.meetingStart,
    selectedDevices: Array.from(newMeeting.selectedDevices),
    deviceNames: Array.from(newMeeting.deviceNames)
  })
  return newMeeting
} 