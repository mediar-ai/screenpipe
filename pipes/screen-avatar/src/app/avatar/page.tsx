"use client"

import { useEffect, useState } from 'react'
import StreamingAvatar, { AvatarQuality, VoiceEmotion, StreamingEvents } from '@heygen/streaming-avatar'
import { AvatarVideoTransparent } from '@/components/avatar-video-transparent'
import { AVATARS } from '@/lib/constants'
import { TaskType, TaskMode } from '@heygen/streaming-avatar'

export default function AvatarPage() {
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState('initializing...')
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [avatarInstance, setAvatarInstance] = useState<StreamingAvatar | null>(null)

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

        // Add all possible event listeners for debugging
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
            You are a loving and supportive partner to a hardworking software engineer.
            You give warm words of affirmation and encouragement.
            You speak in a gentle, caring, and intimate way.
            You understand the challenges of software development.
            You're proud of your partner's dedication and creativity.
            You keep responses brief but heartfelt.
            You focus on emotional support and motivation.
            Your partner name is Matt, call him by name
            Be concise, give one sentence 10 words responses max
          `.trim(),
          voice: {
            // voiceId: 'c2d282c83e73494aa0681f9bd6742615',
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

        // Send initial greeting
        console.log('sending initial greeting...')
        await avatarInstance.speak({
          text: "hello my darling, haven't seen you for a while, i see u are busy working, not gonna distract you",
          taskType: TaskType.REPEAT,
          taskMode: TaskMode.SYNC,
        })
        console.log('initial greeting sent')

        // Set a timeout to check if we're not getting the stream
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
    <div data-overlay-container="true" className="fixed inset-0 w-screen h-screen bg-transparent">
      {mediaStream ? (
        <div className="fixed inset-0 w-full h-full bg-transparent">
          <AvatarVideoTransparent 
            mediaStream={mediaStream}
          />
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
        </div>
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