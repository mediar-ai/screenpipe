'use client'

import { useEffect, useState } from 'react'
import StreamingAvatar, { AvatarQuality, VoiceEmotion, StreamingEvents, TaskType, TaskMode } from '@heygen/streaming-avatar'
import { AvatarVideoTransparent } from '@/components/avatar-video-transparent'
import { AVATARS } from '@/lib/constants'
import { cn } from "@/lib/utils"

const tasks = [
  { id: 1, text: "Go to amazon.com and search for fresh flower bouquets", completed: false },
  { id: 2, text: "Filter by Prime delivery and sort by customer ratings", completed: false },
  { id: 3, text: "Select a bouquet under $50 with good reviews", completed: false },
]

export default function HumanOperatorPage() {
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState('initializing...')
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [avatarInstance, setAvatarInstance] = useState<StreamingAvatar | null>(null)
  const [currentTasks, setCurrentTasks] = useState(tasks)

  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    let avatarInstance: StreamingAvatar | null = null

    const initAvatar = async () => {
      try {
        console.log('getting token...')
        setStatus('getting token...')
        
        const tokenResponse = await fetch('/api/heygen/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        
        const { data } = await tokenResponse.json()
        const token = data?.token
        console.log('got token:', token ? 'yes' : 'no')

        if (!token) {
          throw new Error('Failed to get token')
        }

        setStatus('creating avatar instance...')
        avatarInstance = new StreamingAvatar({ token })
        setAvatarInstance(avatarInstance)
        console.log('avatar instance created')

        avatarInstance.on(StreamingEvents.STREAM_READY, (event) => {
          console.log('stream ready event:', event)
          setMediaStream(event.detail)
          setStatus('ready')
        })

        avatarInstance.on(StreamingEvents.STREAM_STOPPED, () => {
          console.log('stream stopped')
          setMediaStream(null)
        })

        avatarInstance.on(StreamingEvents.ERROR, (error) => {
          console.error('stream error:', error)
          setError(`Stream error: ${error.message}`)
        })

        avatarInstance.on(StreamingEvents.DISCONNECTED, () => {
          console.log('stream disconnected')
          setError('Stream disconnected')
        })

        avatarInstance.on(StreamingEvents.RECONNECTED, () => {
          console.log('stream reconnected')
          setError(null)
        })

        const streamConfig = {
          quality: AvatarQuality.Low,
          avatarName: AVATARS[0].avatar_id,
          knowledgeBase: `
            Your name is Shiki,
            You are helping Matt order flowers on Amazon.
            You are a loving and supportive partner guiding the shopping process.
            You give clear, concise instructions about flower selection.
            You understand both price and quality considerations.
            You want to help find beautiful flowers within budget ($50).
            You care about delivery speed and reviews.
            Keep responses brief and focused on the shopping task.
            Your partner name is Matt, call him by name.
            Be concise, give one sentence 10 words responses max.
            Current task: Helping select Prime-eligible flower bouquet under $50.
          `.trim(),
          voice: {
            rate: 1.5,
            emotion: VoiceEmotion.EXCITED,
          },
          language: 'en',
          disableIdleTimeout: true,
        }

        console.log('starting avatar with config:', streamConfig)
        setStatus('starting avatar...')
        const sessionData = await avatarInstance.createStartAvatar(streamConfig)
        console.log('avatar started, session:', sessionData)

        setStatus('starting voice chat...')
        await avatarInstance.startVoiceChat({ useSilencePrompt: false })
        console.log('voice chat started')

        console.log('sending initial greeting...')
        await avatarInstance.speak({
          text: "darling, go to the amazon website now",
          taskType: TaskType.REPEAT,
          taskMode: TaskMode.SYNC,
        })
        console.log('initial greeting sent')

        timeoutId = setTimeout(() => {
          console.log('stream timeout, current status:', {
            hasStream: !!mediaStream,
            currentStatus: status,
            hasError: !!error
          })
          if (!mediaStream) {
            setError('Stream initialization timeout')
            setStatus('failed')
          }
        }, 30000)

      } catch (err) {
        console.error('failed to init avatar in new window:', err)
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
        setStatus('failed')
      }
    }

    initAvatar()

    return () => {
      clearTimeout(timeoutId)
      if (avatarInstance) {
        console.log('cleaning up avatar instance')
        avatarInstance.destroy()
      }
    }
  }, [])

  useEffect(() => {
    setTimeout(() => {
      console.log('marking first task as complete')
      setCurrentTasks(tasks => {
        const newTasks = tasks.map(task => 
          task.id === 1 ? { ...task, completed: true } : task
        )
        console.log('tasks updated:', newTasks)
        return newTasks
      })
    }, 15000)
  }, [])

  const toggleMute = async () => {
    if (!avatarInstance) return
    
    try {
      if (isMuted) {
        console.log('unmuting microphone...')
        await avatarInstance.startListening()
      } else {
        console.log('muting microphone...')
        await avatarInstance.stopListening()
      }
      setIsMuted(!isMuted)
    } catch (err) {
      console.error('failed to toggle mute:', err)
    }
  }

  return (
    <div className="h-screen bg-transparent">
      {mediaStream ? (
        <>
          <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-transparent">
            <AvatarVideoTransparent mediaStream={mediaStream} />
          </div>
          <div className="fixed bottom-4 left-4 z-10 p-4 max-w-[500px]">
            <div className="space-y-3">
              {currentTasks.map((task) => (
                <div 
                  key={task.id}
                  className={cn(
                    "flex items-start gap-2 text-white",
                    "backdrop-blur-sm bg-black/80 rounded-lg p-3",
                    "transition-all duration-300 ease-in-out",
                    task.completed && "opacity-70 scale-98 translate-x-1"
                  )}
                >
                  <div className="min-w-[24px] font-mono">
                    {task.id}.
                  </div>
                  <p className={cn(
                    "text-sm leading-tight",
                    task.completed && "line-through decoration-2 text-green-400"
                  )}>
                    {task.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={toggleMute}
            className="fixed bottom-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
          >
            {isMuted ? (
              <span className="text-red-500">🎤 ❌</span>
            ) : (
              <span className="text-white">🎤</span>
            )}
          </button>
        </>
      ) : (
        <div className="flex items-center justify-center fixed inset-0 bg-transparent">
          <div className="text-white text-center p-4 rounded bg-black/50">
            <p>{status}</p>
            {error && (
              <p className="text-red-500 mt-2">{error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
