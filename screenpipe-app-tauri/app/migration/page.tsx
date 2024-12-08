"use client";

import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, useAnimationControls } from "framer-motion";
import { Loader2, Monitor, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

const GAME_HEIGHT = 100;
const JUMP_DURATION = 0.5;

const PixelRunner = () => {
  const pixelControls = useAnimationControls();
  const [isJumping, setIsJumping] = useState(false);
  const [score, setScore] = useState(0);

  const jump = useCallback(async () => {
    if (isJumping) return;
    setIsJumping(true);
    await pixelControls.start({
      y: [-40, 0],
      transition: { duration: JUMP_DURATION },
    });
    setIsJumping(false);
  }, [isJumping, pixelControls]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        jump();
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [jump]);

  useEffect(() => {
    const interval = setInterval(() => {
      setScore((s) => s + 1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative h-[100px] w-full border-b border-white/20">
      {/* Ground with scanlines effect */}
      <div className="absolute bottom-0 w-full h-[1px] bg-white/20" />

      {/* Runner */}
      <motion.div
        animate={pixelControls}
        className="absolute bottom-0 left-10"
        initial={{ y: 0 }}
      >
        <div className="w-4 h-4 bg-white rounded-sm" />
      </motion.div>

      {/* Obstacles */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: "-100%" }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute bottom-0 flex items-center gap-32"
      >
        <Monitor className="w-6 h-6 text-white/60" />
        <Mic className="w-6 h-6 text-white/60" />
      </motion.div>

      {/* Score */}
      <div className="absolute top-2 right-4 font-mono text-xs text-white/60">
        {score}
      </div>
    </div>
  );
};

export default function MigrationProgress() {
  const [progress, setProgress] = useState<string>("initializing migration...");

  useEffect(() => {
    const unlisten = listen("progress", (event) => {
      setProgress(event.payload as string);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="relative h-screen w-screen flex items-center justify-center bg-black/95">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 flex flex-col items-center gap-6 p-8 w-full max-w-md"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="w-8 h-8 text-white" />
        </motion.div>

        <div className="w-full">
          <PixelRunner />
        </div>

        <div className="space-y-2 text-center">
          <motion.h3
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-white font-mono text-sm tracking-tight"
          >
            database migration in progress
          </motion.h3>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={cn("text-gray-400 font-mono text-xs", "animate-pulse")}
          >
            {progress}
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-gray-600 font-mono text-xs mt-4"
          >
            press space to jump
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
}
