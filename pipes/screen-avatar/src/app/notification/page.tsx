'use client'

import { motion } from 'framer-motion'

// Export as default component for Next.js page routing
export default function NotificationPage() {
  return (
    <div className="h-screen bg-transparent">
      <div className="flex items-center justify-center fixed inset-0 bg-transparent">
        <PermissionGranted />
      </div>
    </div>
  )
}

export function PermissionGranted() {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex items-center justify-center p-12 rounded-2xl bg-gradient-to-r from-green-400 to-emerald-500 shadow-2xl"
    >
      <motion.span 
        className="text-6xl font-bold text-white"
        animate={{ 
          scale: [1, 1.1, 1],
        }}
        transition={{ 
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        Permission Granted! 🎉
      </motion.span>
    </motion.div>
  )
}
