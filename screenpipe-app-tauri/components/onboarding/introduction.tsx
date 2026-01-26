import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Video, Mic, Brain, Clock } from "lucide-react";
import { motion } from "framer-motion";

interface OnboardingIntroProps {
  className?: string;
  handleNextSlide: () => void;
}

const OnboardingIntro: React.FC<OnboardingIntroProps> = ({
  className = "",
  handleNextSlide,
}) => {
  const features = [
    {
      icon: Video,
      title: "records your screen",
      description: "captures everything you see and do on your computer",
    },
    {
      icon: Mic,
      title: "captures audio",
      description: "records conversations, meetings, and all audio interactions",
    },
    {
      icon: Clock,
      title: "creates a timeline",
      description: "organizes everything into an easy-to-navigate visual timeline",
    },
    {
      icon: Brain,
      title: "ai-powered search",
      description: "ask questions about your recorded data using AI",
    }
  ];

  return (
    <div className={`flex justify-center items-center flex-col space-y-8 ${className}`}>
      <div className="flex flex-col px-2 justify-center items-center">
        <motion.img
          className="w-24 h-24 justify-center"
          src="/128x128.png"
          alt="screenpipe-logo"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
        <h1 className="text-center text-3xl font-mono font-bold text-foreground mt-4">
          screenpipe
        </h1>
        <p className="text-center text-sm font-mono text-muted-foreground mt-2">
          memory infrastructure for your computer
        </p>
        <div className="mt-3 px-3 py-1.5 border border-border bg-card">
          <span className="text-xs font-mono text-muted-foreground tracking-wide">
            100% local • open source
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-2xl">
        {features.map((feature, index) => (
          <motion.div
            key={index}
            className="bg-card border border-border p-5 hover:bg-foreground hover:text-background transition-all duration-150 group"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <feature.icon className="w-6 h-6 text-foreground group-hover:text-background mb-3" strokeWidth={1.5} />
            <h3 className="font-mono text-sm mb-1 text-foreground group-hover:text-background">{feature.title}</h3>
            <p className="font-mono text-xs text-muted-foreground group-hover:text-background/70">{feature.description}</p>
          </motion.div>
        ))}
      </div>

      <div className="border border-border p-6 max-w-md">
        <h3 className="font-mono text-sm text-center mb-4 text-foreground">how it works</h3>
        <div className="flex items-center justify-center space-x-4 font-mono text-xs">
          <div className="flex items-center space-x-2">
            <Video className="w-4 h-4 text-foreground" strokeWidth={1.5} />
            <span className="text-foreground">record</span>
          </div>
          <span className="text-muted-foreground">→</span>
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-foreground" strokeWidth={1.5} />
            <span className="text-foreground">timeline</span>
          </div>
          <span className="text-muted-foreground">→</span>
          <div className="flex items-center space-x-2">
            <Brain className="w-4 h-4 text-foreground" strokeWidth={1.5} />
            <span className="text-foreground">search</span>
          </div>
        </div>
      </div>

      <Button
        onClick={handleNextSlide}
        size="lg"
      >
        get started
        <ArrowRight className="w-4 h-4 ml-2" strokeWidth={1.5} />
      </Button>
    </div>
  );
};

export default OnboardingIntro;
