import React from "react";
import { Button } from "@/components/ui/button";
import { RainbowButton } from "../ui/rainbow-button";
import { 
  ArrowLeft, 
  ArrowRight, 
  Video, 
  Mic, 
  Search, 
  Clock, 
  Settings,
  Bot,
  MonitorSpeaker
} from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";

interface OnboardingInstructionsProps {
  className?: string;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
}

const OnboardingInstructions: React.FC<OnboardingInstructionsProps> = ({
  className = "",
  handleNextSlide,
  handlePrevSlide,
}) => {
  const steps = [
    {
      icon: MonitorSpeaker,
      title: "Background Recording",
      description: "screenpipe runs quietly in the background, capturing your screen and audio activities without interruption.",
      color: "text-blue-500"
    },
    {
      icon: Clock,
      title: "Timeline View",
      description: "Access your timeline to see a visual representation of your day's activities, organized chronologically.",
      color: "text-green-500"
    },
    {
      icon: Search,
      title: "AI Search",
      description: "Use natural language to search through your recorded data. Ask questions like 'What did I work on yesterday?'",
      color: "text-purple-500"
    },
    {
      icon: Settings,
      title: "Customize Settings",
      description: "Adjust recording preferences, privacy settings, and AI configurations to match your workflow.",
      color: "text-orange-500"
    }
  ];

  const shortcuts = [
    { key: "⌘ + ⌥ + S", description: "Show/Hide screenpipe" },
    { key: "⌘ + ⌥ + U", description: "Start Recording" },
    { key: "⌘ + ⌥ + X", description: "Stop Recording" },
  ];

  return (
    <div className={`flex justify-center items-center flex-col space-y-6 p-8 ${className}`}>
      <div className="flex flex-col px-2 justify-center items-center mb-6">
        <motion.div
          className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Bot className="w-8 h-8 text-white" />
        </motion.div>
        <h1 className="text-center text-2xl font-bold mb-2 text-text-primary">
          You&apos;re All Set! 🎉
        </h1>
        <p className="text-center text-text-secondary max-w-md">
          screenpipe is now configured and ready to help you remember everything. Here&apos;s how to get the most out of it.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-xl p-4 text-center"
            >
              <div className="flex items-center justify-center mb-3">
                <step.icon className={`w-8 h-8 ${step.color}`} />
              </div>
              <h3 className="font-semibold text-sm mb-1 text-text-primary">{step.title}</h3>
              <p className="text-xs text-text-secondary">{step.description}</p>
            </motion.div>
          ))}
        </div>

        {/* Quick Tips */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-xl p-6 max-w-2xl border border-border"
        >
          <div className="flex items-center justify-center mb-4">
            <Settings className="w-5 h-5 text-orange-500 mr-2" />
            <h3 className="text-lg font-semibold text-text-primary">Quick Tips</h3>
          </div>
          <ul className="space-y-2 text-sm">
            {shortcuts.map((shortcut, index) => (
              <li key={index} className="flex items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span className="text-text-secondary">{shortcut.key} - {shortcut.description}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Next Steps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-center"
        >
          <p className="text-sm text-text-secondary mb-4">
            Start using your computer normally. screenpipe will build your timeline in the background.
          </p>
          <div className="bg-warning-muted border border-warning rounded-lg p-3">
            <p className="text-xs text-text-primary">
              💡 <strong>Pro tip:</strong> Come back in a few minutes to see your first recorded activities!
            </p>
          </div>
        </motion.div>
      </div>

      <div className="flex justify-center gap-4 mt-6">
        <Button
          variant="ghost"
          onClick={handlePrevSlide}
          className="text-text-secondary hover:text-text-primary"
        >
          Back
        </Button>
        <RainbowButton onClick={handleNextSlide}>
          Start Using screenpipe
          <ArrowRight className="w-4 h-4 ml-2" />
        </RainbowButton>
      </div>
    </div>
  );
};

export default OnboardingInstructions;
