import { useState } from "react";
import ShinyButton from "@/components/ui/shiny-button";
import { motion } from 'framer-motion';
import { ScreenPipeLogo } from "@/features/system-atlas/components/screenpipe-logo";
import { ConversationBox } from "@/components/ui/conversation-box";
import { useOnboardingFlow } from "@/components/onboarding/context/onboarding-context";


export default function WelcomeScreen() {
  const [init, setInit] = useState(false)
  const [typingDone, setIsTypingDone] = useState(false)
  const { handleNextSlide } = useOnboardingFlow()
  return (
    <motion.div 
      className="relative w-[100%] h-[100%] flex flex-col space-y-4 justify-center items-center"
    >
      <ScreenPipeLogo
        init={init}
      />
      <ConversationBox
        setIsTypingDone={setIsTypingDone}
        className="relative z-[100]"
      />
      <div
        className="h-[50px]"
      >
        {typingDone && 
          <ShinyButton 
            onClick={() => handleNextSlide()}
          >
            lets get started!
          </ShinyButton>
        }
      </div>
    </motion.div>
  )
}