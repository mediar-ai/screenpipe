"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { ExternalLinkIcon, CheckCircle2, Monitor, Mic, Brain, Sparkles, Clock, Search, Zap } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks/use-settings";
import posthog from "posthog-js";

interface OnboardingWelcomeProps {
  className?: string;
  handleNextSlide: () => void;
}

// Timeline frame component
function TimelineFrame({ index, isActive, delay }: { index: number; isActive: boolean; delay: number }) {
  return (
    <motion.div
      className="relative flex-shrink-0 w-16 h-10 rounded border overflow-hidden"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: isActive ? 1 : 0.4,
        scale: isActive ? 1.1 : 1,
        borderColor: isActive ? "rgb(var(--foreground))" : "rgb(var(--foreground) / 0.2)",
      }}
      transition={{ duration: 0.3, delay }}
    >
      {/* Frame content - simulated screenshot */}
      <div className="absolute inset-0 bg-gradient-to-br from-foreground/10 to-foreground/5">
        <div className="absolute top-1 left-1 right-1 h-1.5 bg-foreground/20 rounded-sm" />
        <div className="absolute top-3.5 left-1 w-8 h-1 bg-foreground/15 rounded-sm" />
        <div className="absolute top-5 left-1 w-6 h-1 bg-foreground/10 rounded-sm" />
      </div>
      {isActive && (
        <motion.div
          className="absolute inset-0 border-2 border-primary rounded"
          layoutId="activeFrame"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
    </motion.div>
  );
}

// Animated waveform for audio
function AudioWaveform({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex items-center gap-0.5 h-8">
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="w-0.5 bg-foreground/40 rounded-full"
          animate={{
            height: isActive
              ? [8, 16 + Math.random() * 16, 8]
              : 8,
          }}
          transition={{
            duration: 0.5,
            repeat: isActive ? Infinity : 0,
            delay: i * 0.05,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// Main animated demo component
function AnimatedDemo() {
  const [phase, setPhase] = useState(0);
  const [activeFrame, setActiveFrame] = useState(0);
  const timelineProgress = useMotionValue(0);
  const scrubberX = useTransform(timelineProgress, [0, 100], [0, 280]);

  useEffect(() => {
    // Phase cycle: record → capture → timeline → search
    const phaseInterval = setInterval(() => {
      setPhase((p) => (p + 1) % 4);
    }, 3500);
    return () => clearInterval(phaseInterval);
  }, []);

  useEffect(() => {
    // Timeline scrubbing animation
    if (phase === 2) {
      const controls = animate(timelineProgress, 100, {
        duration: 3,
        ease: "easeInOut",
        onUpdate: (v) => {
          setActiveFrame(Math.floor((v / 100) * 7));
        },
      });
      return () => controls.stop();
    } else {
      timelineProgress.set(0);
      setActiveFrame(0);
    }
  }, [phase, timelineProgress]);

  const phaseLabels = [
    { icon: Monitor, label: "recording screen", sublabel: "OCR + context" },
    { icon: Mic, label: "capturing audio", sublabel: "transcription" },
    { icon: Clock, label: "building timeline", sublabel: "searchable history" },
    { icon: Brain, label: "AI ready", sublabel: "ask anything" },
  ];

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-background via-muted/20 to-background">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-foreground/10 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.1, 0.3, 0.1],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: 4 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 4,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Glowing orb in background */}
      <motion.div
        className="absolute w-64 h-64 rounded-full bg-primary/5 blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Main visualization area */}
      <div className="relative z-10 flex flex-col items-center gap-6">

        {/* Screen/Monitor visualization */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Monitor frame */}
          <div className="relative w-80 h-48 bg-background border-2 border-foreground/20 rounded-xl overflow-hidden shadow-2xl">
            {/* Screen bezel */}
            <div className="absolute inset-2 bg-gradient-to-br from-muted/80 to-muted/40 rounded-lg overflow-hidden">

              {/* Simulated screen content */}
              <div className="absolute inset-0 p-3">
                {/* Window chrome */}
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2 h-2 rounded-full bg-red-400/60" />
                  <div className="w-2 h-2 rounded-full bg-yellow-400/60" />
                  <div className="w-2 h-2 rounded-full bg-green-400/60" />
                  <div className="flex-1 h-4 bg-foreground/5 rounded ml-2" />
                </div>

                {/* Content lines with OCR highlighting */}
                <div className="space-y-2 mt-3">
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="flex items-center gap-2"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                    >
                      <motion.div
                        className="h-2.5 bg-foreground/20 rounded"
                        style={{ width: `${40 + Math.random() * 50}%` }}
                        animate={phase === 0 ? {
                          backgroundColor: ["rgba(var(--foreground), 0.2)", "rgba(var(--primary), 0.4)", "rgba(var(--foreground), 0.2)"],
                        } : {}}
                        transition={{
                          duration: 1,
                          delay: i * 0.15,
                          repeat: phase === 0 ? Infinity : 0,
                        }}
                      />
                    </motion.div>
                  ))}
                </div>

                {/* OCR scanning line */}
                <AnimatePresence>
                  {phase === 0 && (
                    <motion.div
                      className="absolute left-0 right-0 h-8 bg-gradient-to-b from-primary/30 via-primary/10 to-transparent"
                      initial={{ top: 0 }}
                      animate={{ top: "100%" }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Audio visualization overlay */}
              <AnimatePresence>
                {phase === 1 && (
                  <motion.div
                    className="absolute bottom-3 left-3 right-3 h-12 bg-background/80 backdrop-blur rounded-lg flex items-center justify-center gap-3 px-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                  >
                    <Mic className="w-4 h-4 text-primary" />
                    <AudioWaveform isActive={phase === 1} />
                    <motion.span
                      className="text-[10px] font-mono text-muted-foreground"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      transcribing...
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Recording indicator */}
            <motion.div
              className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 bg-red-500/90 rounded-full"
              animate={{ opacity: phase < 2 ? [1, 0.5, 1] : 0.3 }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <motion.div
                className="w-2 h-2 bg-white rounded-full"
                animate={{ scale: [1, 0.8, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className="text-[9px] font-mono text-white font-medium">REC</span>
            </motion.div>
          </div>

          {/* Monitor stand */}
          <div className="mx-auto w-20 h-4 bg-foreground/10 rounded-b-lg" />
          <div className="mx-auto w-28 h-2 bg-foreground/10 rounded-full" />
        </motion.div>

        {/* Timeline visualization */}
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: phase >= 2 ? 1 : 0.3, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="relative bg-background/80 backdrop-blur border border-foreground/10 rounded-xl p-4">
            {/* Timeline header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground">timeline</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">today</span>
            </div>

            {/* Timeline frames */}
            <div className="flex gap-2 overflow-hidden">
              {[...Array(8)].map((_, i) => (
                <TimelineFrame
                  key={i}
                  index={i}
                  isActive={phase >= 2 && activeFrame === i}
                  delay={i * 0.05}
                />
              ))}
            </div>

            {/* Scrubber */}
            <div className="relative h-1 bg-foreground/10 rounded-full mt-3">
              <motion.div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow-lg"
                style={{ x: scrubberX }}
              />
              <motion.div
                className="absolute left-0 top-0 bottom-0 bg-primary/50 rounded-full"
                style={{ width: useTransform(timelineProgress, [0, 100], ["0%", "100%"]) }}
              />
            </div>
          </div>
        </motion.div>

        {/* AI Search result */}
        <AnimatePresence>
          {phase === 3 && (
            <motion.div
              className="w-full max-w-sm"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
            >
              <div className="relative bg-background border border-foreground/20 rounded-xl p-4 shadow-xl">
                {/* Glow effect */}
                <div className="absolute -inset-px bg-gradient-to-r from-primary/20 via-transparent to-primary/20 rounded-xl blur-sm" />

                <div className="relative">
                  {/* Search query */}
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-foreground/10">
                    <Search className="w-4 h-4 text-primary" />
                    <motion.span
                      className="text-xs font-mono text-foreground"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      &quot;what did john say about the deadline?&quot;
                    </motion.span>
                  </div>

                  {/* AI Response */}
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="space-y-1.5">
                      <motion.p
                        className="text-xs text-foreground leading-relaxed"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                      >
                        John mentioned the <span className="text-primary font-medium">Q3 deadline is August 15th</span>
                      </motion.p>
                      <motion.p
                        className="text-[10px] text-muted-foreground font-mono"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                      >
                        from: team standup · yesterday 9:34 AM
                      </motion.p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase indicator */}
        <div className="flex items-center gap-6 mt-4">
          {phaseLabels.map((item, i) => (
            <motion.div
              key={i}
              className="flex flex-col items-center gap-1.5"
              animate={{
                opacity: phase === i ? 1 : 0.3,
                scale: phase === i ? 1 : 0.9,
              }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                className="w-10 h-10 rounded-xl flex items-center justify-center border"
                animate={{
                  backgroundColor: phase === i ? "rgb(var(--primary) / 0.1)" : "transparent",
                  borderColor: phase === i ? "rgb(var(--primary))" : "rgb(var(--foreground) / 0.2)",
                }}
              >
                <item.icon className={`w-4 h-4 ${phase === i ? "text-primary" : "text-muted-foreground"}`} />
              </motion.div>
              <span className="text-[9px] font-mono text-muted-foreground text-center leading-tight">
                {item.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

const OnboardingWelcome: React.FC<OnboardingWelcomeProps> = ({
  className = "",
  handleNextSlide,
}) => {
  const { settings } = useSettings();
  const isLoggedIn = !!settings?.user?.token;

  const handleSkip = () => {
    posthog.capture("onboarding_login_skipped");
    handleNextSlide();
  };

  const handleContinue = () => {
    posthog.capture("onboarding_login_completed", {
      email: settings?.user?.email,
    });
    handleNextSlide();
  };

  return (
    <div className={`w-full h-full flex ${className}`}>
      {/* Left panel - Auth & value prop */}
      <div className="w-[35%] flex flex-col justify-center px-8 py-6 border-r border-border/50 bg-background">
        <div className="max-w-xs mx-auto space-y-8">
          {/* Logo and title */}
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="relative"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <img
                className="w-14 h-14"
                src="/128x128.png"
                alt="screenpipe"
              />
              {/* Subtle glow */}
              <motion.div
                className="absolute inset-0 bg-primary/20 rounded-xl blur-xl"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">screenpipe</h1>
              <p className="text-sm text-muted-foreground mt-1">
                AI memory for your screen
              </p>
            </div>
          </motion.div>

          {/* Feature highlights */}
          <motion.div
            className="space-y-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            {[
              { icon: Zap, text: "records everything locally" },
              { icon: Search, text: "AI-powered search" },
              { icon: Clock, text: "visual timeline" },
            ].map((item, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-2.5 text-xs text-muted-foreground"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
              >
                <item.icon className="w-3.5 h-3.5" />
                <span>{item.text}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Auth section */}
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            {isLoggedIn ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  signed in as {settings?.user?.email}
                </div>
                <Button
                  variant="default"
                  onClick={handleContinue}
                  className="w-full"
                  size="lg"
                >
                  continue
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  variant="default"
                  onClick={handleSkip}
                  className="w-full group"
                  size="lg"
                >
                  get started
                  <motion.span
                    className="ml-2"
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    →
                  </motion.span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => open("https://screenpi.pe/login")}
                  className="w-full text-muted-foreground text-xs"
                >
                  sign in for cloud features
                  <ExternalLinkIcon className="w-3 h-3 ml-1.5" />
                </Button>
              </div>
            )}
          </motion.div>

          {/* Trust badges */}
          <motion.div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              100% local
            </div>
            <span className="text-foreground/20">•</span>
            <span>open source</span>
            <span className="text-foreground/20">•</span>
            <span>your data stays yours</span>
          </motion.div>
        </div>
      </div>

      {/* Right panel - Animated demo */}
      <div className="w-[65%] relative overflow-hidden">
        <AnimatedDemo />
      </div>
    </div>
  );
};

export default OnboardingWelcome;
