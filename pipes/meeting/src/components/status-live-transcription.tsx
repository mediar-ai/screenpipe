import React, { useRef, useEffect, useState, useCallback } from 'react'

const useBrowserTranscriptionStream = () => {
  const ws = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080')
    ws.current = socket

    socket.onopen = () => {
      console.log('websocket connected')
      setIsConnected(true)
    }

    socket.onerror = (error) => {
      console.error('websocket error:', error)
      setIsConnected(false)
    }

    socket.onclose = () => {
      console.log('websocket closed')
      setIsConnected(false)
    }

    return () => {
      socket.close()
      ws.current = null
    }
  }, [])

  const stopTranscriptionBrowser = useCallback(() => {
    if (!ws.current || !isConnected) {
      console.log('websocket not ready, skipping stop command')
      return
    }
    
    try {
      ws.current.send(JSON.stringify({ type: 'stop' }))
    } catch (err) {
      console.error('failed to send stop command:', err)
    }
  }, [isConnected])

  return {
    stopTranscriptionBrowser,
  }
}

export default useBrowserTranscriptionStream 