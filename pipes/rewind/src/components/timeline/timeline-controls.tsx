"use client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { format, isAfter, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface TimelineControlsProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onJumpToday: () => void;
  className?: string;
}

export function TimelineControls({
  currentDate,
  onDateChange,
  onJumpToday,
  className,
}: TimelineControlsProps) {
  const today = startOfDay(new Date());

  const jumpDay = (days: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);

    // Prevent jumping to future dates
    if (isAfter(newDate, today)) {
      onDateChange(today);
      return;
    }

    onDateChange(newDate);
  };

  // Disable forward button if we're at today
  const isAtToday = startOfDay(currentDate).getTime() === today.getTime();

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 bg-muted/50 rounded-md",
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => jumpDay(-1)}
        className="h-8 w-8"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentDate.toISOString()}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
            duration: 0.2,
          }}
          className="bg-background border rounded px-3 py-1 text-sm font-mono"
        >
          {format(currentDate, "d MMM yyyy")}
        </motion.div>
      </AnimatePresence>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => jumpDay(1)}
        className="h-8 w-8"
        disabled={isAtToday}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <div className="h-4 w-px bg-border mx-2" />

      <Button
        variant="ghost"
        size="icon"
        onClick={onJumpToday}
        className="h-8 w-8"
        disabled={isAtToday}
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
    </div>
  );
}
