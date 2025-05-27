import React from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RainbowButton } from "../ui/rainbow-button";
import {
  CheckCircle,
  Play,
  Search,
  MessageSquare,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import OnboardingNavigation from "@/components/onboarding/navigation";
import { motion } from "framer-motion";

interface OnboardingInstructionsProps {
  className?: string;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
}

const OnboardingInstructions: React.FC<OnboardingInstructionsProps> = ({
  className,
  handleNextSlide,
  handlePrevSlide,
}) => {
  const features = [
    {
      icon: Play,
      title: "Recording Started",
      description: "OpenRewind is now capturing your screen and audio",
      status: "active"
    },
    {
      icon: Search,
      title: "Timeline Ready",
      description: "View and navigate through your recorded activities",
      status: "ready"
    },
    {
      icon: MessageSquare,
      title: "AI Assistant",
      description: "Ask questions about your recorded data",
      status: "ready"
    }
  ];

  const quickTips = [
    "Use the timeline at the bottom to navigate through your day",
    "Scroll through your screen recordings with your mouse wheel",
    "Click the AI panel to ask questions about what you've recorded",
    "Audio transcriptions will appear automatically for meetings and calls"
  ];

  return (
    <div className={`${className} flex flex-col h-full`}>
      <DialogHeader className="flex flex-col px-2 justify-center items-center mb-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <img
            className="w-20 h-20 justify-center mb-4"
            src="/128x128.png"
            alt="openrewind-logo"
          />
          <div className="absolute -top-2 -right-2">
            <CheckCircle className="w-8 h-8 text-green-500 bg-white rounded-full" />
          </div>
        </motion.div>
        
        <DialogTitle className="text-center text-2xl font-bold">
          You&apos;re all set! 🎉
        </DialogTitle>
        <p className="text-center text-muted-foreground mt-2 max-w-md">
          OpenRewind is ready to help you remember, find, and understand everything you do on your computer.
        </p>
      </DialogHeader>

      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border rounded-xl p-4 text-center"
            >
              <div className="flex items-center justify-center mb-3">
                <feature.icon className="w-8 h-8 text-primary" />
                {feature.status === "active" && (
                  <div className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                )}
              </div>
              <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
              <p className="text-xs text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>

        {/* Quick Tips */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-xl p-6 max-w-2xl"
        >
          <div className="flex items-center justify-center mb-4">
            <Sparkles className="w-5 h-5 text-orange-500 mr-2" />
            <h3 className="text-lg font-semibold">Quick Tips</h3>
          </div>
          <ul className="space-y-2 text-sm">
            {quickTips.map((tip, index) => (
              <li key={index} className="flex items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span className="text-muted-foreground">{tip}</span>
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
          <p className="text-sm text-muted-foreground mb-4">
            Start using your computer normally. OpenRewind will build your timeline in the background.
          </p>
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              💡 <strong>Pro tip:</strong> Come back in a few minutes to see your first recorded activities!
            </p>
          </div>
        </motion.div>
      </div>

      <div className="flex justify-center gap-4 mt-6">
        <Button
          variant="ghost"
          onClick={handlePrevSlide}
          className="text-muted-foreground"
        >
          Back
        </Button>
        <RainbowButton onClick={handleNextSlide}>
          Start Using OpenRewind
          <ArrowRight className="w-4 h-4 ml-2" />
        </RainbowButton>
      </div>
    </div>
  );
};

export default OnboardingInstructions;
