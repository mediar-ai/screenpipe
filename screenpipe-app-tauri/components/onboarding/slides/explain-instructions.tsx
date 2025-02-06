import React from "react";
import OnboardingNavigation from "@/components/onboarding/slides/navigation";
import { useOnboarding } from "../context";
import { motion } from 'framer-motion'
import { Terminal } from 'lucide-react'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
}

const OnboardingInstructions = () => {
  const { handleEnd, handlePrevSlide } = useOnboarding();

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="h-full flex flex-col items-center justify-center space-y-8 p-6"
    >
      <motion.div variants={item}>
        <Terminal className="w-16 h-16 mb-4" />
      </motion.div>

      <motion.h2 
        variants={item}
        className="text-2xl font-mono text-center"
      >
        welcome to screenpipe
      </motion.h2>

      <motion.div 
        variants={item}
        className="max-w-md text-center space-y-4"
      >
        <p className="text-muted-foreground">
          screenpipe is a bridge between context-free AI and context-aware super intelligence
        </p>
        
        <p className="text-muted-foreground">
          it records your screen & mic 24/7, extracts text & speech, and connects to AI to do magic
        </p>
      </motion.div>

      <motion.div
        variants={item}
        className="bg-muted p-4 rounded-lg font-mono text-sm"
      >
        <p>key features:</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>24/7 screen & audio recording</li>
          <li>OCR & speech-to-text</li>
          <li>local database storage</li>
          <li>extensible pipe system</li>
          <li>cross-platform support</li>
        </ul>
      </motion.div>

      <div className="h-[100px] my-16" />

      <OnboardingNavigation
        className="mt-8"
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={handleEnd}
        prevBtnText="previous"
        nextBtnText="next"
      />
    </motion.div>
  );
};

export default OnboardingInstructions;
