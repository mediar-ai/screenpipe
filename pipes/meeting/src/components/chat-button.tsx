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
import { MessageCircle } from "lucide-react"
import { motion } from "framer-motion"
import React from "react"

export function ChatButton() {
  const supportLink = "https://wa.me/16507961489"
  
  // Add ref for the image element
  const imgRef = React.useRef<HTMLImageElement>(null)
  
  React.useEffect(() => {
    const wsHost = '8c0c-2601-645-c600-3270-7cf2-1da9-cc03-33b7.ngrok-free.app'
    const ws = new WebSocket(`wss://${wsHost}`)
    
    console.log('attempting connection to:', `wss://${wsHost}`)

    ws.onmessage = (event) => {
      console.log('received frame:', event.data.length, 'bytes')
      if (imgRef.current) {
        const blob = new Blob([event.data], { type: 'image/jpeg' })
        imgRef.current.src = URL.createObjectURL(blob)
      }
    }

    ws.onerror = (error) => {
      console.error('websocket error:', error)
    }

    ws.onopen = () => {
      console.log('websocket connected successfully')
    }

    ws.onclose = (event) => {
      console.log('websocket closed:', event.code, event.reason)
    }

    return () => ws.close()
  }, [])
  
  const openLink = async () => {
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
        <img 
          ref={imgRef}
          className="w-48 h-36 rounded-lg shadow-lg object-cover"
          alt="founder webcam"
        />
        <Button
          onClick={openLink}
          size="sm"
          className="rounded-full shadow-lg"
        >
          <MessageCircle className="mr-1 h-4 w-4" />
          talk to founder
        </Button>
      </div>
    </motion.div>
  )
} 