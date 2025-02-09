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

export function ChatButton() {
  const supportLink = "https://wa.me/16507961489"
  
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
  const isTauri = typeof window !== 'undefined' && (
    window.__TAURI__ || 
    window.location.protocol === 'tauri:' ||
    window.location.protocol === 'asset:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  )
  
  if (isTauri) {
    return null
  }
  
  return (
    <motion.div 
      className="fixed bottom-2 right-2 z-50"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
    >
      <Button
        onClick={openLink}
        size="sm"
        className="rounded-full shadow-lg"
      >
        <MessageCircle className="mr-1 h-4 w-4" />
        talk to founder
      </Button>
    </motion.div>
  )
} 