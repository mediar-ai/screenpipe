'use client'

import { Button } from "@/components/ui/button"
import { MessageCircle } from "lucide-react"
import { motion } from "framer-motion"

export function ChatButton() {
  const supportLink = "https://wa.me/16507961489"
  
  return (
    <motion.div 
      className="fixed bottom-2 right-2 z-50"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
    >
      <Button
        onClick={() => window.open(supportLink, '_blank')}
        size="sm"
        className="rounded-full shadow-lg"
      >
        <MessageCircle className="mr-1 h-4 w-4" />
        talk to founder
      </Button>
    </motion.div>
  )
} 