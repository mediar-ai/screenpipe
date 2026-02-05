"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface MemoryGridProps {
  progress: number;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Memory Grid — sharp monochrome animation.
 * A grid of screen-frame rectangles that materialize as the system boots.
 * Scan line sweeps across, "capturing" each cell. Cells fill with faint
 * data patterns. Connected by thin circuit-like lines.
 * 
 * Evokes: screen capture, infinite memory, AI indexing.
 * Style: black & white, sharp corners, no curves.
 */
export function ParticleStream({
  progress,
  width = 400,
  height = 200,
  className = "",
}: MemoryGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);
  const progressRef = useRef(progress);
  const cellsRef = useRef<Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    revealed: boolean;
    revealTime: number;
    brightness: number;
    scanLines: number[];
  }>>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Grid setup
    const cols = 8;
    const rows = 4;
    const gap = 3;
    const marginX = 20;
    const marginY = 16;
    const cellW = (width - marginX * 2 - gap * (cols - 1)) / cols;
    const cellH = (height - marginY * 2 - gap * (rows - 1)) / rows;

    // Initialize cells once
    if (!initializedRef.current) {
      initializedRef.current = true;
      const cells: typeof cellsRef.current = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = marginX + col * (cellW + gap);
          const y = marginY + row * (cellH + gap);
          // Generate random scan line positions for each cell
          const numLines = 3 + Math.floor(Math.random() * 4);
          const scanLines: number[] = [];
          for (let l = 0; l < numLines; l++) {
            scanLines.push(Math.random());
          }
          cells.push({
            x, y,
            w: cellW,
            h: cellH,
            revealed: false,
            revealTime: 0,
            brightness: 0,
            scanLines,
          });
        }
      }
      cellsRef.current = cells;
    }

    // Scan line state
    let scanX = -40;
    let scanSpeed = 0.8;

    function draw() {
      const p = progressRef.current;
      timeRef.current += 1;
      const t = timeRef.current;

      ctx!.clearRect(0, 0, width, height);

      // Update scan line
      scanSpeed = 0.6 + p * 2.0;
      scanX += scanSpeed;
      if (scanX > width + 40) {
        scanX = -40;
      }

      const cells = cellsRef.current;

      // How many cells should be revealed based on progress
      const targetRevealed = Math.floor(p * cells.length);

      // Reveal cells as scan line passes over them
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (!cell.revealed && scanX > cell.x + cell.w * 0.5 && i < targetRevealed + 4) {
          cell.revealed = true;
          cell.revealTime = t;
        }

        // Animate brightness
        if (cell.revealed) {
          const age = t - cell.revealTime;
          const targetBright = i < targetRevealed ? 1 : 0.3;
          cell.brightness += (targetBright - cell.brightness) * 0.05;
        } else {
          cell.brightness *= 0.95;
        }
      }

      // Draw connection lines between revealed cells (circuit-board style)
      ctx!.strokeStyle = `rgba(120, 120, 120, ${0.06 + p * 0.08})`;
      ctx!.lineWidth = 0.5;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (!cell.revealed || cell.brightness < 0.1) continue;

        const cx = cell.x + cell.w / 2;
        const cy = cell.y + cell.h / 2;

        // Connect to right neighbor
        if (i % cols < cols - 1) {
          const right = cells[i + 1];
          if (right.revealed && right.brightness > 0.1) {
            const rx = right.x + right.w / 2;
            ctx!.globalAlpha = Math.min(cell.brightness, right.brightness) * 0.5;
            ctx!.beginPath();
            ctx!.moveTo(cell.x + cell.w, cy);
            ctx!.lineTo(right.x, cy);
            ctx!.stroke();
          }
        }

        // Connect to bottom neighbor
        if (i + cols < cells.length) {
          const bottom = cells[i + cols];
          if (bottom.revealed && bottom.brightness > 0.1) {
            ctx!.globalAlpha = Math.min(cell.brightness, bottom.brightness) * 0.4;
            ctx!.beginPath();
            ctx!.moveTo(cx, cell.y + cell.h);
            ctx!.lineTo(cx, bottom.y);
            ctx!.stroke();
          }
        }
      }
      ctx!.globalAlpha = 1;

      // Draw cells
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.brightness < 0.01) continue;

        const b = cell.brightness;

        // Cell background — sharp rectangle
        const bgGray = Math.round(30 + b * 20);
        ctx!.fillStyle = `rgba(${bgGray}, ${bgGray}, ${bgGray}, ${b * 0.35})`;
        ctx!.fillRect(cell.x, cell.y, cell.w, cell.h);

        // Cell border — sharp
        const borderGray = Math.round(80 + b * 60);
        ctx!.strokeStyle = `rgba(${borderGray}, ${borderGray}, ${borderGray}, ${b * 0.4})`;
        ctx!.lineWidth = 0.5;
        ctx!.strokeRect(cell.x, cell.y, cell.w, cell.h);

        // Scan line pattern inside cell (faint horizontal lines = "screen data")
        if (b > 0.3) {
          for (const linePos of cell.scanLines) {
            const ly = cell.y + linePos * cell.h;
            const lineAlpha = (b - 0.3) * 0.25;
            const lineGray = 100 + Math.round(b * 40);
            ctx!.strokeStyle = `rgba(${lineGray}, ${lineGray}, ${lineGray}, ${lineAlpha})`;
            ctx!.lineWidth = 0.5;
            ctx!.beginPath();
            ctx!.moveTo(cell.x + 2, ly);
            ctx!.lineTo(cell.x + cell.w - 2, ly);
            ctx!.stroke();
          }
        }

        // Subtle flicker on recently revealed cells
        if (cell.revealed) {
          const age = t - cell.revealTime;
          if (age < 30) {
            const flickerAlpha = (1 - age / 30) * 0.15;
            ctx!.fillStyle = `rgba(200, 200, 200, ${flickerAlpha})`;
            ctx!.fillRect(cell.x, cell.y, cell.w, cell.h);
          }
        }

        // Small "node" dot at top-left corner of revealed cells
        if (b > 0.5) {
          const nodeSize = 1.5;
          const nodeGray = Math.round(150 + b * 80);
          const nodePulse = 0.6 + Math.sin(t * 0.03 + i * 0.7) * 0.4;
          ctx!.fillStyle = `rgba(${nodeGray}, ${nodeGray}, ${nodeGray}, ${b * nodePulse * 0.7})`;
          ctx!.fillRect(cell.x - nodeSize / 2, cell.y - nodeSize / 2, nodeSize, nodeSize);
        }
      }

      // Scan line — sharp vertical line sweeping across
      const scanAlpha = 0.15 + p * 0.2;
      const scanWidth = 2;
      // Main line
      ctx!.fillStyle = `rgba(200, 200, 200, ${scanAlpha})`;
      ctx!.fillRect(scanX, marginY - 4, scanWidth, height - marginY * 2 + 8);

      // Glow around scan line (using rectangles, not gradients — sharp feel)
      for (let g = 1; g <= 4; g++) {
        const glowAlpha = scanAlpha * (0.15 / g);
        const glowWidth = g * 4;
        ctx!.fillStyle = `rgba(180, 180, 180, ${glowAlpha})`;
        ctx!.fillRect(scanX - glowWidth, marginY - 4, glowWidth, height - marginY * 2 + 8);
      }

      // Progress bar at very bottom — thin, sharp
      const barY = height - 6;
      const barH = 1;
      const barWidth = width - marginX * 2;
      // Track
      ctx!.fillStyle = `rgba(80, 80, 80, 0.2)`;
      ctx!.fillRect(marginX, barY, barWidth, barH);
      // Fill
      const fillWidth = barWidth * Math.min(1, p);
      ctx!.fillStyle = `rgba(180, 180, 180, ${0.4 + p * 0.4})`;
      ctx!.fillRect(marginX, barY, fillWidth, barH);

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
      className={className}
    />
  );
}

/**
 * Minimal progress dots — monochrome, sharp.
 */
export function ProgressSteps({
  steps,
  className = "",
}: {
  steps: Array<{ label: string; done: boolean; active: boolean }>;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center gap-5 ${className}`}>
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <motion.div
            className={`w-1 h-1 ${
              step.done
                ? "bg-foreground"
                : step.active
                ? "bg-foreground/50"
                : "bg-foreground/15"
            }`}
            animate={
              step.active
                ? {
                    opacity: [0.4, 1, 0.4],
                  }
                : {}
            }
            transition={
              step.active
                ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
                : {}
            }
          />
          <span
            className={`font-mono text-[9px] tracking-wider uppercase ${
              step.done
                ? "text-foreground"
                : step.active
                ? "text-foreground/60"
                : "text-foreground/20"
            }`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
