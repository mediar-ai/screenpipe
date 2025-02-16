import localforage from "localforage"

// Only initialize localforage on the client side
const chatStore = typeof window !== 'undefined' 
  ? localforage.createInstance({
      name: "chat-sessions",
      storeName: "chats"
    })
  : null

export interface ChatSession {
    id: string
    threadId: string
    messages: Array<{
        id: string
        content: string
        fromUser: boolean
        timestamp: string
    }>
    startTime: string
    endTime?: string
    isArchived?: boolean
}

// In-memory fallback for server-side
const serverSideStore = new Map<string, ChatSession>()

export async function createChatSession(sessionId: string, threadId: string): Promise<ChatSession> {
    const session: ChatSession = {
        id: sessionId,
        threadId,
        messages: [],
        startTime: new Date().toISOString(),
    }
    
    if (chatStore) {
        await chatStore.setItem(sessionId, session)
    } else {
        serverSideStore.set(sessionId, session)
    }
    
    console.log('created new chat session:', { sessionId, threadId })
    return session
}

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
    try {
        if (chatStore) {
            return await chatStore.getItem<ChatSession>(sessionId)
        }
        return serverSideStore.get(sessionId) || null
    } catch (error) {
        console.error('failed to get chat session:', error)
        return null
    }
}

export async function updateChatSession(sessionId: string, update: Partial<ChatSession>): Promise<ChatSession | null> {
    try {
        const session = await getChatSession(sessionId)
        if (!session) return null
        
        const updated = {
            ...session,
            ...update,
            id: session.id, // Never allow id change
        }
        
        if (chatStore) {
            await chatStore.setItem(sessionId, updated)
        } else {
            serverSideStore.set(sessionId, updated)
        }
        
        return updated
    } catch (error) {
        console.error('failed to update chat session:', error)
        return null
    }
}

export async function archiveChatSession(sessionId: string): Promise<ChatSession | null> {
    return updateChatSession(sessionId, {
        isArchived: true,
        endTime: new Date().toISOString()
    })
}

export async function getAllChatSessions(): Promise<ChatSession[]> {
    try {
        const sessions: ChatSession[] = []
        if (chatStore) {
            await chatStore.iterate<ChatSession, void>((value) => {
                sessions.push(value)
            })
        } else {
            serverSideStore.forEach((value) => {
                sessions.push(value)
            })
        }
        
        // Sort by start time, newest first
        return sessions.sort((a, b) => 
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        )
    } catch (error) {
        console.error('failed to get all chat sessions:', error)
        return []
    }
} 