import localforage from "localforage"

// Define types
export interface VocabularyEntry {
    original: string
    corrected: string
    timestamp: number
    meetingId?: string
}

// Initialize store
const vocabularyStore = localforage.createInstance({
    name: "vocabulary",
    storeName: "corrections"
})

// const CURRENT_STORAGE_VERSION = 1

export async function addVocabularyEntry(original: string, corrected: string, meetingId?: string): Promise<void> {
    try {
        const entries = await getVocabularyEntries()
        const newEntry: VocabularyEntry = {
            original,
            corrected,
            timestamp: Date.now(),
            meetingId
        }

        console.log('adding vocabulary entry:', newEntry)
        await vocabularyStore.setItem("vocabulary", [...entries, newEntry])

        // Verify save
        const saved = await vocabularyStore.getItem("vocabulary")
        console.log('verified saved vocabulary:', saved)
    } catch (error) {
        console.error("error adding vocabulary entry:", error)
        throw error
    }
}

export async function getVocabularyEntries(): Promise<VocabularyEntry[]> {
    try {
        const entries = await vocabularyStore.getItem<VocabularyEntry[]>("vocabulary") || []
        
        // Log storage stats
        // const entriesCount = entries.length
        // const storageSize = new TextEncoder().encode(JSON.stringify(entries)).length / 1024
// 
        // console.log("vocabulary storage stats:", {
        //     entriesCount,
        //     storageSize: `${storageSize.toFixed(2)}kb`,
        // })

        return entries
    } catch (error) {
        console.error("error getting vocabulary entries:", error)
        throw error
    }
}

export async function clearVocabulary(): Promise<void> {
    try {
        await vocabularyStore.clear()
        console.log("vocabulary cleared from storage")
    } catch (error) {
        console.error("error clearing vocabulary:", error)
        throw error
    }
}

export async function cleanupOldEntries(keepCount: number = 1000): Promise<void> {
    try {
        const entries = await getVocabularyEntries()
        const entriesToKeep = entries.slice(-keepCount)
        await vocabularyStore.setItem("vocabulary", entriesToKeep)
        console.log(`cleaned up vocabulary storage, keeping last ${keepCount} entries`)
    } catch (error) {
        console.error("error cleaning up old vocabulary entries:", error)
        throw error
    }
} 