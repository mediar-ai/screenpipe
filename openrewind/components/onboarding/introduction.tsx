import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { RainbowButton } from "../ui/rainbow-button";
import { ArrowRight, Video, Mic, Brain, Clock, Play } from "lucide-react";
import { useSettings } from "@/lib/hooks/use-settings";
import posthog from "posthog-js";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { motion } from "framer-motion";
import { commands } from "@/lib/utils/tauri";

interface OnboardingIntroProps {
  className?: string;
  handleNextSlide: () => void;
}

const OnboardingIntro: React.FC<OnboardingIntroProps> = ({
  className = "",
  handleNextSlide,
}) => {
  const { completeOnboarding } = useOnboarding();
  const [currentStep, setCurrentStep] = useState(0);
  const [showDemo, setShowDemo] = useState(false);

  const handleSkip = async () => {
    try {
      await completeOnboarding();
      posthog.capture("onboarding_skipped");
      
      // Show main window and close onboarding window
      await commands.showWindow("Main");
      
      // Close the onboarding window
      if (typeof window !== 'undefined' && 'close' in window) {
        window.close();
      }
    } catch (error) {
      console.error("Error skipping onboarding:", error);
    }
  };

  const features = [
    {
      icon: Video,
      title: "Records Your Screen",
      description: "Captures everything you see and do on your computer",
      color: "text-blue-500"
    },
    {
      icon: Mic,
      title: "Captures Audio",
      description: "Records conversations, meetings, and all audio interactions",
      color: "text-green-500"
    },
    {
      icon: Clock,
      title: "Creates a Timeline",
      description: "Organizes everything into an easy-to-navigate visual timeline",
      color: "text-purple-500"
    },
    {
      icon: Brain,
      title: "AI-Powered Search",
      description: "Ask questions about your recorded data using AI",
      color: "text-orange-500"
    }
  ];

  const demoSteps = [
    "🖥️ OpenRewind quietly records your screen activity",
    "🎙️ Captures audio from meetings and conversations", 
    "📅 Creates a beautiful timeline of your day",
    "🤖 AI helps you find anything: 'What did I discuss in my 2pm meeting?'"
  ];

  return (
    <div className={`flex justify-center items-center flex-col space-y-6 ${className}`}>
      <div className="flex flex-col px-2 justify-center items-center">
        <motion.img
          className="w-24 h-24 justify-center"
          src="/128x128.png"
          alt="openrewind-logo"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
        <h1 className="text-center text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Welcome to OpenRewind
        </h1>
        <p className="text-center text-lg text-muted-foreground mt-2">
          Your AI-powered digital memory assistant
        </p>
      </div>

      {!showDemo ? (
        <>
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="bg-card border rounded-xl p-4 hover:shadow-lg transition-all duration-300"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <feature.icon className={`w-8 h-8 ${feature.color} mb-3`} />
                <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-xl p-6 max-w-2xl">
            <h3 className="text-lg font-semibold text-center mb-3">How it works</h3>
            <div className="flex items-center justify-center space-x-3 text-sm">
              <div className="flex items-center space-x-1">
                <Video className="w-4 h-4 text-blue-500" />
                <span>Record</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center space-x-1">
                <Clock className="w-4 h-4 text-purple-500" />
                <span>Timeline</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center space-x-1">
                <Brain className="w-4 h-4 text-orange-500" />
                <span>AI Search</span>
              </div>
            </div>
          </div>

          <div className="flex gap-4 mt-6">
            <Button
              variant="ghost"
              onClick={() => setShowDemo(true)}
              className="text-muted-foreground"
            >
              <Play className="w-4 h-4 mr-2" />
              See Demo
            </Button>
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-muted-foreground"
            >
              Skip Setup
            </Button>
            <RainbowButton onClick={handleNextSlide}>
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </RainbowButton>
          </div>
        </>
      ) : (
        <div className="max-w-2xl">
          <div className="bg-black rounded-xl overflow-hidden shadow-2xl">
            <div className="bg-gray-800 px-4 py-2 flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-gray-300 text-sm ml-2">OpenRewind Demo</span>
            </div>
            <div className="p-6 h-64 bg-gradient-to-br from-gray-900 to-gray-800 relative overflow-hidden">
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <div className="text-center text-white space-y-4">
                  {demoSteps.map((step, index) => (
                    <motion.p
                      key={index}
                      className="text-lg"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.8, duration: 0.5 }}
                    >
                      {step}
                    </motion.p>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
          
          <div className="flex gap-4 mt-6 justify-center">
            <Button
              variant="ghost"
              onClick={() => setShowDemo(false)}
              className="text-muted-foreground"
            >
              Back
            </Button>
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-muted-foreground"
            >
              Skip Setup
            </Button>
            <RainbowButton onClick={handleNextSlide}>
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </RainbowButton>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingIntro;
