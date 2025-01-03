"use client"
import { motion } from 'framer-motion';
import ScreenpipeLogo from '@/features/system-atlas/components/screenpipe-logo';
import ConversationBox from '@/features/system-atlas/components/conversation-box';

export default function WelcomeScreen() {
  return (
    <motion.div 
      className="relative w-[100%] h-[100%] flex flex-col space-y-4 justify-center items-center"
    >
        <ScreenpipeLogo hideBorder/>
        <ConversationBox/>
    </motion.div>
  )
}