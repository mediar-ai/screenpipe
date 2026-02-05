"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  delay: number;
}

interface ParticleStreamProps {
  /** 0 → 1 progress. Controls density, speed, glow intensity */
  progress: number;
  /** Width of the container */
  width?: number;
  /** Height of the container */
  height?: number;
  className?: string;
}

/**
 * Animated particle stream that flows through a pipe shape.
 * Particles are sparse at low progress, dense and fast at high progress.
 * The pipe glows brighter as progress increases.
 */
export function ParticleStream({
  progress,
  width = 400,
  height = 200,
  className = "",
}: ParticleStreamProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    life: number;
    maxLife: number;
    hue: number;
  }>>([]);
  const timeRef = useRef(0);
  const progressRef = useRef(progress);

  // Keep progress ref in sync
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // HiDPI support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pipeY = height / 2;
    const pipeHeight = 40;
    const pipeLeft = width * 0.1;
    const pipeRight = width * 0.9;
    const pipeWidth = pipeRight - pipeLeft;

    // Pipe entrance/exit shapes
    const capRadius = pipeHeight / 2;

    function spawnParticle() {
      const p = progressRef.current;
      // More particles at higher progress
      const baseCount = 2 + Math.floor(p * 8);
      const speed = 1.5 + p * 4;

      for (let i = 0; i < baseCount; i++) {
        // Spawn from left side with slight random spread
        const yOffset = (Math.random() - 0.5) * pipeHeight * 0.7;
        particlesRef.current.push({
          x: pipeLeft - 10 + Math.random() * 20,
          y: pipeY + yOffset,
          vx: speed * (0.7 + Math.random() * 0.6),
          vy: (Math.random() - 0.5) * 0.3,
          size: 1.5 + Math.random() * 2.5 + p * 1.5,
          opacity: 0.3 + Math.random() * 0.5 + p * 0.2,
          life: 0,
          maxLife: 100 + Math.random() * 60,
          hue: 200 + Math.random() * 40 + p * 20, // blue → cyan as progress increases
        });
      }
    }

    function draw() {
      const p = progressRef.current;
      timeRef.current += 1;

      // Clear canvas fully each frame (transparent background blends with page)
      ctx!.globalCompositeOperation = "source-over";
      ctx!.clearRect(0, 0, width, height);

      // Draw pipe body (subtle)
      const pipeOpacity = 0.06 + p * 0.08;
      ctx!.save();
      ctx!.beginPath();
      ctx!.roundRect(pipeLeft, pipeY - pipeHeight / 2, pipeWidth, pipeHeight, capRadius);
      ctx!.fillStyle = `rgba(120, 180, 255, ${pipeOpacity})`;
      ctx!.fill();

      // Pipe border glow
      ctx!.strokeStyle = `rgba(100, 160, 255, ${0.1 + p * 0.15})`;
      ctx!.lineWidth = 1;
      ctx!.stroke();
      ctx!.restore();

      // Center glow that intensifies with progress
      if (p > 0.3) {
        const glowIntensity = (p - 0.3) / 0.7;
        const gradient = ctx!.createRadialGradient(
          width / 2, pipeY, 0,
          width / 2, pipeY, pipeWidth * 0.4
        );
        gradient.addColorStop(0, `rgba(100, 180, 255, ${glowIntensity * 0.12})`);
        gradient.addColorStop(0.5, `rgba(80, 140, 255, ${glowIntensity * 0.05})`);
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx!.fillStyle = gradient;
        ctx!.fillRect(0, 0, width, height);
      }

      // Spawn particles
      if (timeRef.current % Math.max(1, Math.floor(4 - p * 3)) === 0) {
        spawnParticle();
      }

      // Update & draw particles
      ctx!.globalCompositeOperation = "lighter";
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.life += 1;
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Gentle sine wave motion
        particle.y += Math.sin(particle.life * 0.05 + particle.x * 0.01) * 0.3;

        // Constrain to pipe vertically (soft bounce)
        const distFromCenter = Math.abs(particle.y - pipeY);
        if (distFromCenter > pipeHeight * 0.4) {
          particle.vy -= (particle.y - pipeY) * 0.02;
        }

        // Fade in at start, fade out at end
        const lifeRatio = particle.life / particle.maxLife;
        const fadeIn = Math.min(1, particle.life / 10);
        const fadeOut = particle.x > pipeRight - 30 ? Math.max(0, (pipeRight - particle.x) / 30) : 1;
        const alpha = particle.opacity * fadeIn * fadeOut;

        if (particle.x > pipeRight + 20 || particle.life > particle.maxLife || alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        // Draw particle with glow
        const glowSize = particle.size * 3;
        const gradient = ctx!.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, glowSize
        );
        gradient.addColorStop(0, `hsla(${particle.hue}, 85%, 75%, ${alpha})`);
        gradient.addColorStop(0.3, `hsla(${particle.hue}, 75%, 65%, ${alpha * 0.6})`);
        gradient.addColorStop(0.6, `hsla(${particle.hue}, 65%, 55%, ${alpha * 0.2})`);
        gradient.addColorStop(1, `hsla(${particle.hue}, 60%, 50%, 0)`);

        ctx!.beginPath();
        ctx!.arc(particle.x, particle.y, glowSize, 0, Math.PI * 2);
        ctx!.fillStyle = gradient;
        ctx!.fill();

        // Core bright dot
        ctx!.beginPath();
        ctx!.arc(particle.x, particle.y, particle.size * 0.5, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${particle.hue}, 90%, 85%, ${alpha})`;
        ctx!.fill();
      }

      // Draw entrance/exit caps with glow
      ctx!.globalCompositeOperation = "source-over";

      // Left cap (entrance) — brighter glow when particles enter
      const entranceGlow = ctx!.createRadialGradient(
        pipeLeft, pipeY, capRadius * 0.5,
        pipeLeft, pipeY, capRadius * 2.5
      );
      entranceGlow.addColorStop(0, `rgba(100, 180, 255, ${0.15 + p * 0.2})`);
      entranceGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx!.fillStyle = entranceGlow;
      ctx!.fillRect(pipeLeft - capRadius * 2.5, pipeY - capRadius * 2.5, capRadius * 5, capRadius * 5);

      // Right cap (exit) — glows green when progress is high
      const exitHue = p > 0.7 ? 140 : 210; // blue → green
      const exitGlow = ctx!.createRadialGradient(
        pipeRight, pipeY, capRadius * 0.5,
        pipeRight, pipeY, capRadius * 2.5
      );
      exitGlow.addColorStop(0, `hsla(${exitHue}, 70%, 60%, ${0.1 + p * 0.25})`);
      exitGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx!.fillStyle = exitGlow;
      ctx!.fillRect(pipeRight - capRadius * 2.5, pipeY - capRadius * 2.5, capRadius * 5, capRadius * 5);

      // "Ready" burst when progress reaches 1
      if (p >= 1) {
        const burstPhase = (timeRef.current % 120) / 120;
        const burstRadius = capRadius * 3 * burstPhase;
        const burstAlpha = (1 - burstPhase) * 0.3;
        const burstGradient = ctx!.createRadialGradient(
          pipeRight, pipeY, 0,
          pipeRight, pipeY, burstRadius
        );
        burstGradient.addColorStop(0, `rgba(100, 255, 150, ${burstAlpha})`);
        burstGradient.addColorStop(1, "rgba(100, 255, 150, 0)");
        ctx!.fillStyle = burstGradient;
        ctx!.beginPath();
        ctx!.arc(pipeRight, pipeY, burstRadius, 0, Math.PI * 2);
        ctx!.fill();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className={`${className}`}
    />
  );
}

/**
 * Progress steps shown below the particle stream.
 * Minimal — just dots with tiny labels.
 */
export function ProgressSteps({
  steps,
  className = "",
}: {
  steps: Array<{ label: string; done: boolean; active: boolean }>;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center gap-6 ${className}`}>
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <motion.div
            className={`w-2 h-2 rounded-full ${
              step.done
                ? "bg-green-400"
                : step.active
                ? "bg-blue-400"
                : "bg-muted-foreground/30"
            }`}
            animate={
              step.active
                ? {
                    scale: [1, 1.4, 1],
                    opacity: [0.7, 1, 0.7],
                  }
                : {}
            }
            transition={
              step.active
                ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                : {}
            }
          />
          <span
            className={`font-mono text-[10px] ${
              step.done
                ? "text-green-400/80"
                : step.active
                ? "text-foreground/80"
                : "text-muted-foreground/40"
            }`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
