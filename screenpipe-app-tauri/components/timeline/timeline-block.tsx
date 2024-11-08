import { StreamTimeSeriesResponse } from "@/app/timeline/page";
import { useTimelineSelection } from "@/lib/hooks/use-timeline-selection";
import { debounce } from "lodash";
import { useMemo, useState, useRef, useEffect } from "react";

interface TimeBlock {
  appName: string;
  windowName: string;
  startTime: Date;
  endTime: Date;
  color: string;
}

interface TimelineBlocksProps {
  frames: StreamTimeSeriesResponse[];
  timeRange: {
    start: Date;
    end: Date;
  };
}

// First, memoize the color generation function
const useColorGenerator = () => {
  return useMemo(() => {
    const colorCache = new Map<string, string>();

    return (appName: string): string => {
      const cached = colorCache.get(appName);
      if (cached) return cached;

      const hash = Array.from(appName).reduce(
        (h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0,
        0
      );

      const golden_ratio = 0.618033988749895;
      const hue = ((hash * golden_ratio * 1.5) % 1) * 360;
      const sat = 85 + (hash % 15);
      const light = 60;

      const color = `hsl(${hue}, ${sat}%, ${light}%)`;
      colorCache.set(appName, color);
      return color;
    };
  }, []); // Empty deps since this never needs to change
};

export function TimelineBlocks({ frames, timeRange }: TimelineBlocksProps) {
  const getAppColor = useColorGenerator();
  const { setSelectionRange } = useTimelineSelection();


  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex flex-col"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      style={{ userSelect: "none" }}
    >
      {/* Only render actual activity blocks */}
      {blocks.map((block, index) => {
        const blockStart =
          ((block.startTime.getTime() - timeRange.start.getTime()) /
            (timeRange.end.getTime() - timeRange.start.getTime())) *
          100;
        const blockWidth =
          ((block.endTime.getTime() - block.startTime.getTime()) /
            (timeRange.end.getTime() - timeRange.start.getTime())) *
          100;

        const tooltipText = `${block.appName}\n${
          block.windowName
        }\n${formatTime(block.startTime)} - ${formatTime(block.endTime)}`;

        return (
          <div
            key={`${block.appName}-${index}`}
            data-block-index={index}
            className="absolute top-0 bottom-0 transition-opacity z-10 opacity-50 hover:opacity-80"
            style={{
              transform: `translateX(${blockStart}%) scaleX(${
                blockWidth / 100
              })`,
              transformOrigin: "left",
              width: "100%",
              backgroundColor: block.color,
            }}
            title={tooltipText}
          />
        );
      })}

      {/* Selection overlay */}
      {selectionBounds && (
        <div
          className="absolute top-0 bottom-0 bg-black/20 dark:bg-white/20 z-20"
          style={{
            left: `${selectionBounds.left}%`,
            width: `${selectionBounds.width}%`,
            willChange: "transform",
          }}
        />
      )}
    </div>
  );
}
