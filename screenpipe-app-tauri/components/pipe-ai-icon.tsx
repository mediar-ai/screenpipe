"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PipeAIIconProps {
  className?: string;
  size?: number;
  animated?: boolean;
  thinking?: boolean;
}

/**
 * Animated Pipe AI Icon
 * Geometric, Escher-inspired design with flowing data animation
 */
export function PipeAIIcon({
  className,
  size = 24,
  animated = true,
  thinking = false,
}: PipeAIIconProps) {
  // Data flow particles
  const particles = [0, 1, 2];

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Main pipe structure - L-shaped */}
      <motion.path
        d="M4 4h6v2H6v12h12v-6h2v8H4V4z"
        fill="currentColor"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />

      {/* Inner pipe hollow */}
      <motion.path
        d="M8 8h2v8h8v2H8V8z"
        fill="currentColor"
        fillOpacity={0.3}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      />

      {/* Pipe opening top */}
      <motion.rect
        x="4"
        y="2"
        width="8"
        height="2"
        fill="currentColor"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        style={{ transformOrigin: "left" }}
      />

      {/* Pipe opening right */}
      <motion.rect
        x="20"
        y="14"
        width="2"
        height="8"
        fill="currentColor"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        style={{ transformOrigin: "bottom" }}
      />

      {/* Flowing data particles */}
      {animated && particles.map((i) => (
        <motion.circle
          key={i}
          r={1.5}
          fill="currentColor"
          initial={{ cx: 7, cy: 3, opacity: 0 }}
          animate={
            thinking
              ? {
                  cx: [7, 7, 11, 11, 21],
                  cy: [3, 11, 11, 19, 19],
                  opacity: [0, 1, 1, 1, 0],
                }
              : {
                  cx: [7, 7, 11, 11, 21],
                  cy: [3, 11, 11, 19, 19],
                  opacity: [0, 0.8, 0.8, 0.8, 0],
                }
          }
          transition={{
            duration: thinking ? 1.2 : 2,
            repeat: Infinity,
            delay: i * (thinking ? 0.3 : 0.5),
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Corner accent - geometric detail */}
      <motion.path
        d="M14 6l2 2-2 2-2-2 2-2z"
        fill="currentColor"
        fillOpacity={0.6}
        initial={{ scale: 0, rotate: 45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.5, duration: 0.3, type: "spring" }}
        style={{ transformOrigin: "14px 8px" }}
      />
    </motion.svg>
  );
}

/**
 * Static version for non-animated contexts
 */
export function PipeAIIconStatic({
  className,
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
    >
      <path d="M4 4h6v2H6v12h12v-6h2v8H4V4z" fill="currentColor" />
      <path d="M8 8h2v8h8v2H8V8z" fill="currentColor" fillOpacity={0.3} />
      <rect x="4" y="2" width="8" height="2" fill="currentColor" />
      <rect x="20" y="14" width="2" height="8" fill="currentColor" />
      <path d="M14 6l2 2-2 2-2-2 2-2z" fill="currentColor" fillOpacity={0.6} />
    </svg>
  );
}
