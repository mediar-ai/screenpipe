import { useState } from 'react'
import StreamingAvatar, { StreamingEvents } from '@heygen/streaming-avatar'

export function useAvatarInitialization() {
  const [avatar, setAvatar] = useState<any>(null)
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [debug, setDebug] = useState<string>('')
  const [isInitializing, setIsInitializing] = useState(false)

  const initializeAvatar = async () => {
    if (avatar) {
      console.log('avatar already initialized')
      return
    }

    setIsInitializing(true)
    try {
      const tokenResponse = await fetch('/api/heygen/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!tokenResponse.ok) {
        throw new Error(`failed to get session token: ${tokenResponse.status}`)
      }
      
      const { data } = await tokenResponse.json()
      const token = data?.token
      console.log('got session token:', token)

      if (!token) {
        throw new Error('no token received from server')
      }

      const avatarInstance = new StreamingAvatar({ token })
      console.log('avatar instance created:', avatarInstance)

      avatarInstance.on(StreamingEvents.STREAM_READY, (event) => {
        console.log('stream ready event:', event)
        setMediaStream(event.detail)
      })

      avatarInstance.on(StreamingEvents.STREAM_STOPPED, () => {
        console.log('stream stopped')
        setMediaStream(null)
      })

      avatarInstance.on(StreamingEvents.ERROR, (error: any) => {
        console.error('stream error:', error)
        console.log('error details:', { error, type: typeof error, detail: error.detail })
        setDebug(`stream error: ${error?.detail || error?.message || 'unknown error'}`)
      })

      avatarInstance.on(StreamingEvents.USER_START, (event) => {
        console.log('user started talking:', event)
      })

      avatarInstance.on(StreamingEvents.USER_STOP, (event) => {
        console.log('user stopped talking:', event)
      })

      setAvatar(avatarInstance)
      setDebug('avatar initialized successfully')
    } catch (err: any) {
      console.error('failed to initialize:', err)
      setDebug(`initialization failed: ${err.message}`)
    } finally {
      setIsInitializing(false)
    }
  }

  return {
    avatar,
    mediaStream,
    debug,
    setDebug,
    isInitializing,
    initializeAvatar
  }
}