'use client'

// Add this type declaration
declare global {
  interface Window {
    __TAURI__?: {
      [key: string]: unknown
    }
  }
}

import { Button } from "@/components/ui/button"
import { MessageCircle, VideoOff, MicOff } from "lucide-react"
import { motion } from "framer-motion"
import React from "react"
import { useSound } from 'use-sound'

type Message = {
  id: string
  content: string
  fromUser: boolean
  timestamp: string
}

export function ChatButton() {
  const supportLink = "https://wa.me/16507961489"
  
  // Add ref for the image element
  const imgRef = React.useRef<HTMLImageElement>(null)
  
  // Add state to control webcam visibility
  const [showWebcam, setShowWebcam] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [message, setMessage] = React.useState('')
  const [isSending, setIsSending] = React.useState(false)
  const [showChat, setShowChat] = React.useState(false)
  const [sessionId, setSessionId] = React.useState('')
  
  // Add ref for message container
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  
  // Update sound hook with base64 beep
  const [playMessageSound] = useSound('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH6PhYR0TkZXcoyarKyvoJKYmY+AmH2FmZSHhpGVkZJ/gYGEkIqEhoyNlZmJb4J6c4iFjqCfkH+GhYKJg4OMiYSFjYyLkZSPlI2Oi4mJiouJhIeKi4qFhomA', { 
    volume: 0.5,
    onplayerror: (id: number, err: Error) => {
      console.log('failed to play sound:', err)
    }
  })
  const lastMessageCountRef = React.useRef(messages.length)
  
  // Add state for WebSocket connection status
  const [isWebsocketConnected, setIsWebsocketConnected] = React.useState(false)
  const [wsError, setWsError] = React.useState<string | null>(null)
  
  // Add loading state
  const [isLoadingWebcam, setIsLoadingWebcam] = React.useState(true)
  
  // Generate unique session ID when chat opens
  React.useEffect(() => {
    if (showChat) {
      setSessionId(crypto.randomUUID())
    }
  }, [showChat])
  
  // Poll for new messages
  React.useEffect(() => {
    if (!showChat || !sessionId) return
    
    const seenMessageIds = new Set<string>()
    const M13V_ID = '974812370868269098' // Your actual Discord ID from the response
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/messages?sessionId=${sessionId}`)
        const data = await response.json()
        console.log('received raw data:', data)
        
        if (data.messages) {
          const transformedMessages = data.messages.map((msg: any) => {
            if (!msg) {
              console.log('skipping null message')
              return null
            }

            console.log('processing message:', msg)
            
            // Skip already seen messages
            if (seenMessageIds.has(msg.id)) {
              console.log('skipping duplicate message:', msg.id)
              return null
            }
            
            seenMessageIds.add(msg.id)
            
            return {
              id: msg.id,
              content: msg.content || '[empty message]',
              // Messages from m13v_ (974812370868269098) are not fromUser
              fromUser: msg.author?.id !== M13V_ID,
              timestamp: msg.timestamp
            }
          }).filter(Boolean)

          console.log('transformed messages:', transformedMessages)
          
          if (transformedMessages.length > 0) {
            setMessages(prev => [...prev, ...transformedMessages])
          }
        }
      } catch (error) {
        console.error('failed to fetch messages:', error)
      }
    }, 3000)
    
    return () => clearInterval(pollInterval)
  }, [showChat, sessionId])

  React.useEffect(() => {
    if (!showWebcam) return

    const wsHost = process.env.NEXT_PUBLIC_FOUNDER_WEBSOCKET_URL
    if (!wsHost) {
      setShowWebcam(false)
      return
    }

    let ws: WebSocket | null = null
    setIsLoadingWebcam(true) // Reset loading state when connecting
    
    try {
      ws = new WebSocket(`wss://${wsHost}`)
      let processingFrame = false

      ws.onmessage = async (event) => {
        if (processingFrame || !event.data || !imgRef.current) return
        processingFrame = true
        
        try {
          const blob = new Blob([event.data], { type: 'image/jpeg' })
          const url = URL.createObjectURL(blob)
          
          await new Promise((resolve) => {
            if (!imgRef.current) return resolve(null)
            imgRef.current.onload = () => {
              URL.revokeObjectURL(url)
              setIsLoadingWebcam(false) // Disable loading once first frame arrives
              resolve(null)
            }
            imgRef.current.src = url
          })
        } finally {
          processingFrame = false
        }
      }

      ws.onopen = () => setIsWebsocketConnected(true)
      ws.onclose = () => {
        setIsWebsocketConnected(false)
        setShowWebcam(false)
      }
      ws.onerror = () => {
        setIsWebsocketConnected(false)
        setShowWebcam(false)
      }
    } catch {
      setShowWebcam(false)
    }

    return () => {
      if (ws) {
        ws.close()
      }
    }
  }, [showWebcam])
  
  // Play sound when new messages arrive
  React.useEffect(() => {
    if (messages.length > lastMessageCountRef.current) {
      // Only play for messages from Matt (not from user)
      const lastMessage = messages[messages.length - 1]
      if (!lastMessage.fromUser) {
        playMessageSound()
      }
    }
    lastMessageCountRef.current = messages.length
  }, [messages, playMessageSound])

  // Add scroll to bottom function
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }
  
  // Scroll when messages update
  React.useEffect(() => {
    scrollToBottom()
  }, [messages])

  const openLink = async () => {
    setShowWebcam(true) // Show webcam on click
    try {
      console.log('opening link:', supportLink)
      
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      console.log('is localhost?', isLocalhost, 'hostname:', window.location.hostname)
      
      const isTauri = typeof window !== 'undefined' && (
        window.__TAURI__ || 
        window.location.protocol === 'tauri:' ||
        window.location.protocol === 'asset:' ||
        isLocalhost
      )
      console.log('is tauri?', isTauri, 'protocol:', window.location?.protocol)
      
      if (!isTauri) {
        console.log('using browser')
        window.open(supportLink, '_blank')
        console.log('opened in browser')
      }
    } catch (error) {
      console.error('failed to open link:', error)
    }
  }

  const closeChat = async () => {
    setShowWebcam(false)
    console.log('closing founder chat webcam')
    
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: '👋 User closed founder chat webcam',
          sessionId: crypto.randomUUID(),
          userAgent: window.navigator.userAgent,
          isSystem: true
        })
      })
    } catch (error) {
      console.error('failed to notify about webcam close:', error)
    }
  }
  
  const sendMessage = async (text: string) => {
    if (!text.trim() || !sessionId) return
    
    setIsSending(true)
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text,
          sessionId,
          userAgent: window.navigator.userAgent,
        })
      })
      
      const data = await response.json()
      console.log('message response:', data)
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message')
      }
      
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        content: text,
        fromUser: true,
        timestamp: new Date().toISOString()
      }])
      setMessage('')
    } catch (error) {
      console.error('failed to send message:', error)
    } finally {
      setIsSending(false)
    }
  }
  
  const openChat = async () => {
    try {
      // Send notification first
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: '👋 User opened founder chat',
          sessionId: crypto.randomUUID(),
          userAgent: window.navigator.userAgent,
          isSystem: true
        })
      })
      
      // Then show chat and webcam
      setShowChat(true)
      setShowWebcam(true)
    } catch (error) {
      console.error('failed to notify about chat open:', error)
      // Still open chat even if notification fails
      setShowChat(true)
      setShowWebcam(true)
    }
  }
  
  // Don't render button in Tauri environment
  // const isTauri = typeof window !== 'undefined' && (
  //   window.__TAURI__ || 
  //   window.location.protocol === 'tauri:' ||
  //   window.location.protocol === 'asset:' ||
  //   window.location.hostname === 'localhost' ||
  //   window.location.hostname === '127.0.0.1'
  // )
  
  // if (isTauri) {
  //   return null
  // }
  
  return (
    <motion.div 
      className="fixed bottom-2 right-2 z-50"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
    >
      <div className="flex flex-col items-end gap-2">
        {showWebcam && isWebsocketConnected && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <Button
              onClick={closeChat}
              size="sm"
              variant="outline" 
              className="absolute top-2 right-2 h-6 w-6 rounded-full p-0 bg-black/80 text-white hover:bg-black/90 z-10"
            >
              ×
            </Button>
            
            {isLoadingWebcam && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/90 rounded-lg z-0">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span className="text-xs text-white/80">connecting...</span>
                </div>
              </div>
            )}
            
            <img 
              ref={imgRef}
              className="w-48 h-36 rounded-lg shadow-lg object-cover"
              alt="founder webcam"
            />
            <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/80 rounded-full px-2 py-1 group cursor-help z-10">
              <VideoOff className="h-3 w-3 text-white" />
              <MicOff className="h-3 w-3 text-white" />
              <span className="absolute left-0 -bottom-8 hidden group-hover:block text-xs text-white bg-black/80 px-2 py-1 rounded-full whitespace-nowrap">
                viewing only - your camera is off
              </span>
            </div>
          </motion.div>
        )}
        {!showChat && (
          <div className="relative">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                onClick={openChat}
                size="sm"
                variant="outline"
                className="rounded-full shadow-lg bg-black text-white hover:bg-black/90 hover:text-white"
              >
                <MessageCircle className="mr-1 h-4 w-4" />
                talk to founder
              </Button>
            </motion.div>
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [1, 0.7, 1]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute -top-2 -right-2 flex items-center gap-1 bg-black/80 rounded-full px-2 py-0.5"
            >
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-white font-medium">online</span>
            </motion.div>
          </div>
        )}
        {showChat && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-black/90 p-4 rounded-lg shadow-lg w-80 max-h-[500px] flex flex-col"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-white text-sm">Chat with Matt</span>
              <Button
                onClick={() => {
                  setShowChat(false)
                  // Send notification when closing chat
                  fetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      message: '👋 User closed founder chat',
                      sessionId: crypto.randomUUID(),
                      userAgent: window.navigator.userAgent,
                      isSystem: true
                    })
                  }).catch(error => {
                    console.error('failed to notify about chat close:', error)
                  })
                }}
                size="sm"
                variant="ghost"
                className="h-6 w-6 rounded-full p-0 text-white hover:bg-white/20"
              >
                ×
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto mb-3 space-y-2">
              {messages.map(msg => (
                <div 
                  key={msg.id}
                  className={`flex ${msg.fromUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`
                    max-w-[80%] rounded-lg px-3 py-2 text-sm
                    ${msg.fromUser 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-white/10 text-white'}
                  `}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {/* Add div ref for scrolling */}
              <div ref={messagesEndRef} />
            </div>
            
            <div className="flex gap-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex-1 bg-white/10 text-white rounded p-2 text-sm"
                placeholder="Type your message..."
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(message)
                  }
                }}
              />
              <Button
                onClick={() => sendMessage(message)}
                disabled={isSending || !message.trim()}
                size="sm"
                className="bg-white text-black hover:bg-white/90"
              >
                Send
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
} 