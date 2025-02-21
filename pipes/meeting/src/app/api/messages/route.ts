// Force Node.js runtime for this route
export const runtime = 'nodejs'
// Force dynamic behavior since Discord client needs to maintain state
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createChatSession, getChatSession, updateChatSession } from '@/lib/storage/chat-storage'

// Store active chat sessions
const sessions: Record<string, {
  threadId: string
  lastMessageId?: string
}> = {}

const DISCORD_API = 'https://discord.com/api/v10'

// Add token validation helper
function validateToken(token: string | undefined): string {
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is not set')
  }
  
  // Token should start with Bot prefix if not already present
  if (!token.startsWith('Bot ')) {
    token = `Bot ${token}`
  }
  
  // Basic format validation
  if (!/^Bot [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('DISCORD_BOT_TOKEN format is invalid')
  }
  
  return token
}

async function discordRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${DISCORD_API}${endpoint}`
  console.log('discord request:', { 
    url, 
    method: options.method,
    hasToken: !!process.env.DISCORD_BOT_TOKEN,
    tokenLength: process.env.DISCORD_BOT_TOKEN?.length
  })
  
  try {
    const token = validateToken(process.env.DISCORD_BOT_TOKEN)
    
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    
    const text = await res.text()
    console.log('discord response:', { 
      status: res.status, 
      text,
      headers: Object.fromEntries(res.headers)
    })
    
    if (!res.ok) {
      throw new Error(`Discord API error: ${res.status} - ${text}`)
    }
    
    return JSON.parse(text)
  } catch (error) {
    console.error('discord request failed:', {
      error,
      token: process.env.DISCORD_BOT_TOKEN?.slice(0, 10) + '...',
      endpoint
    })
    throw error
  }
}

// Add interface for transformed message
interface TransformedMessage {
  id: string
  content: string
  fromUser: boolean
  timestamp: string
  author?: {
    id: string
    username: string
  }
}

export async function POST(req: Request) {
  try {
    const { message, sessionId, userAgent, type } = await req.json()
    console.log('received message request:', { sessionId, messageLength: message.length, type })
    
    // Get or create chat session
    let session = await getChatSession(sessionId)
    if (!session) {
      console.log('creating new thread for session:', sessionId)
      const thread = await discordRequest(`/channels/${process.env.DISCORD_CHANNEL_ID}/threads`, {
        method: 'POST',
        body: JSON.stringify({
          name: `Chat ${sessionId.slice(0,8)}`,
          type: 11,
          auto_archive_duration: 1440
        })
      })
      
      session = await createChatSession(sessionId, thread.id)
      console.log('created thread and session:', { threadId: thread.id, sessionId })
    }

    // Format message based on type
    const messageContent = type === 'system' 
      ? `System: ${message}\n\nContext: ${userAgent}`
      : `User: ${message}\n\nContext: ${userAgent}`

    // Send message to thread
    console.log('sending message to thread:', session.threadId)
    const discordMsg = await discordRequest(`/channels/${session.threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: messageContent
      })
    })
    
    // Don't store system messages in chat history
    if (type !== 'system') {
      await updateChatSession(sessionId, {
        messages: [...session.messages, {
          id: discordMsg.id,
          content: message,
          fromUser: true,
          timestamp: new Date().toISOString()
        }]
      })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('discord error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' }, 
      { status: 500 }
    )
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sessionId')
  
  if (!sessionId) {
    return NextResponse.json({ messages: [] })
  }

  try {
    // Get session from local storage
    const session = await getChatSession(sessionId)
    if (!session) {
      return NextResponse.json({ messages: [] })
    }

    // Initialize session tracking if needed
    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        threadId: session.threadId
      }
    }

    // Fetch latest messages from Discord
    const messages = await discordRequest(
      `/channels/${session.threadId}/messages?limit=50`
    )
    
    // Store last message ID for future reference
    if (messages.length > 0) {
      sessions[sessionId].lastMessageId = messages[0].id
    }
    
    // Add detailed message logging
    console.log('raw discord messages details:', messages.map((msg: any) => ({
      id: msg.id,
      content: msg.content,
      type: msg.type,
      author: msg.author?.username,
      timestamp: msg.timestamp,
      hasEmbeds: !!msg.embeds?.length,
      hasAttachments: !!msg.attachments?.length,
      flags: msg.flags,
      components: msg.components,
      // Full message for debugging
      fullMessage: msg
    })))
    
    // Transform each message to determine its origin and content.
    const transformedMessages = messages.map((msg: any) => {
      // Default to user message if from your Discord user ID
      let fromUser = msg.author?.id === '974812370868868269'
      
      // Initialize content array to collect all content parts
      let contentParts: string[] = []
      
      // Add main content if present, removing the Context part
      if (msg.content) {
        const content = msg.content.split('\n\nContext:')[0] // Only take content before Context
        // Skip messages that start with "User:" if they're from the bot
        if (!fromUser && content.startsWith('User:')) {
          return null
        }
        contentParts.push(content)
      }
      
      // Add embed content if present
      if (msg.embeds?.length > 0) {
        msg.embeds.forEach((embed: any) => {
          if (embed.title) contentParts.push(embed.title)
          if (embed.description) contentParts.push(embed.description)
          if (embed.fields?.length > 0) {
            embed.fields.forEach((field: any) => {
              contentParts.push(`${field.name}: ${field.value}`)
            })
          }
        })
      }
      
      // Add attachment URLs if present
      if (msg.attachments?.length > 0) {
        contentParts.push(...msg.attachments.map((a: any) => a.url))
      }
      
      // Combine all content parts
      let content = contentParts.join('\n').trim()
      
      // If message is from user but empty, use a placeholder
      if (fromUser && !content) {
        content = '[empty message]'
        console.log('detected empty user message:', { id: msg.id, author: msg.author?.username })
      }
      
      // Handle User: prefix logic (for bot messages)
      if (content.startsWith('User:')) {
        content = content.slice('User:'.length).trim()
        fromUser = true
        console.log('detected user message via prefix:', { id: msg.id, content })
      } else {
        console.log('detected message:', { 
          id: msg.id, 
          content,
          fromUser,
          author: msg.author?.username,
          hasEmbeds: msg.embeds?.length > 0,
          hasAttachments: msg.attachments?.length > 0
        })
      }

      return {
        id: msg.id,
        content,
        fromUser,
        timestamp: msg.timestamp,
        author: msg.author,
      }
    })
    .filter(Boolean) as TransformedMessage[] // Type assertion here
    
    console.log('transformed messages:', transformedMessages)
    
    // Update session with latest messages
    await updateChatSession(sessionId, {
      messages: transformedMessages.map((msg: TransformedMessage) => ({
        id: msg.id,
        content: msg.content,
        fromUser: msg.fromUser,
        timestamp: msg.timestamp
      }))
    })
    
    return NextResponse.json({
      messages: transformedMessages.reverse()
    })
  } catch (error) {
    console.error('failed to fetch messages:', {
      error,
      sessionId
    })
    return NextResponse.json(
      { error: 'failed to fetch messages' }, 
      { status: 500 }
    )
  }
} 