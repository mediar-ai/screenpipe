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

  // Memoize the sorted frames
  const sortedFrames = useMemo(
    // TODO: this should not be necessary
    () =>
      [...frames].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ),
    [frames]
  );

  // Memoize the block generation with precise dependencies
  const blocks = useMemo(() => {
    if (frames.length === 0) return [];

    const visibleBlocks: (TimeBlock & { isGap?: boolean })[] = [];
    let currentBlock: TimeBlock | null = null;
    let lastEndTime: Date | null = null;

    for (const frame of sortedFrames) {
      const timestamp = new Date(frame.timestamp);
      if (!frame.devices?.[0]?.metadata?.app_name) continue;

      const appName = frame.devices[0].metadata.app_name;
      const windowName = frame.devices[0].metadata.window_name;

      if (timestamp < timeRange.start || timestamp > timeRange.end) continue;

      // Handle gap detection
      if (lastEndTime && timestamp.getTime() - lastEndTime.getTime() > 1000) {
        visibleBlocks.push({
          appName: "gap",
          windowName: "No Activity",
          startTime: lastEndTime,
          endTime: timestamp,
          color: "transparent",
          isGap: true,
        });
      }

      // Handle block creation/update
      if (!currentBlock) {
        currentBlock = {
          appName,
          windowName,
          startTime: timestamp,
          endTime: timestamp,
          color: getAppColor(appName),
        };
      } else if (currentBlock.appName !== appName) {
        visibleBlocks.push(currentBlock);
        currentBlock = {
          appName,
          windowName,
          startTime: timestamp,
          endTime: timestamp,
          color: getAppColor(appName),
        };
      } else {
        currentBlock.endTime = timestamp;
      }

      lastEndTime = timestamp;
    }

    if (currentBlock) visibleBlocks.push(currentBlock);

    // Handle edge gaps
    if (visibleBlocks[0]?.startTime.getTime() > timeRange.start.getTime()) {
      visibleBlocks.unshift({
        appName: "gap",
        windowName: "No Activity",
        startTime: timeRange.start,
        endTime: visibleBlocks[0].startTime,
        color: "transparent",
        isGap: true,
      });
    }

    const lastBlock = visibleBlocks[visibleBlocks.length - 1];
    if (lastBlock && lastBlock.endTime.getTime() < timeRange.end.getTime()) {
      visibleBlocks.push({
        appName: "gap",
        windowName: "No Activity",
        startTime: lastBlock.endTime,
        endTime: timeRange.end,
        color: "transparent",
        isGap: true,
      });
    }

    return visibleBlocks;
  }, [
    sortedFrames, // Use sorted frames instead of raw frames
    timeRange.start, // Use timestamp instead of Date object
    timeRange.end,
    getAppColor,
  ]);

  // Add selection state
  const [isDragging, setIsDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Add mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const blockIndex = element?.getAttribute("data-block-index");
    if (blockIndex) {
      const index = parseInt(blockIndex);
      setSelectionStart(index);
      setSelectionEnd(index);
      setSelectionRange({
        start: blocks[index].startTime,
        end: blocks[index].endTime,
      });
      setIsDragging(true);
    }
  };

  // Add debouncing to mouse move handler
  const handleMouseMove = useMemo(
    () =>
      debounce((e: React.MouseEvent) => {
        if (!isDragging || selectionStart === null) return;
        const element = document.elementFromPoint(e.clientX, e.clientY);
        const blockIndex = element?.getAttribute("data-block-index");
        if (blockIndex) {
          setSelectionEnd(parseInt(blockIndex));
          setSelectionRange({
            start: blocks[selectionStart].startTime,
            end: blocks[parseInt(blockIndex)].endTime,
          });
        }
      }, 16), // ~60fps
    [isDragging, selectionStart]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Calculate selection bounds only when needed
  const selectionBounds = useMemo(() => {
    if (selectionStart === null || selectionEnd === null) return null;

    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);

    return {
      left:
        ((blocks[start].startTime.getTime() - timeRange.start.getTime()) /
          (timeRange.end.getTime() - timeRange.start.getTime())) *
        100,
      width:
        ((blocks[end].endTime.getTime() - blocks[start].startTime.getTime()) /
          (timeRange.end.getTime() - timeRange.start.getTime())) *
        100,
    };
  }, [selectionStart, selectionEnd, blocks, timeRange]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex flex-col"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      style={{ userSelect: "none" }}
    >
      {/* Regular blocks */}
      {blocks.map((block, index) => {
        const blockStart =
          ((block.startTime.getTime() - timeRange.start.getTime()) /
            (timeRange.end.getTime() - timeRange.start.getTime())) *
          100;
        const blockWidth =
          ((block.endTime.getTime() - block.startTime.getTime()) /
            (timeRange.end.getTime() - timeRange.start.getTime())) *
          100;

        return (
          <div
            key={`${block.appName}-${index}`}
            data-block-index={index}
            className={`absolute top-0 bottom-0 transition-opacity z-10 ${
              block.isGap
                ? "hover:bg-gray-200 dark:hover:bg-gray-700 opacity-0 hover:opacity-30"
                : "opacity-50 hover:opacity-80"
            }`}
            style={{
              transform: `translateX(${blockStart}%) scaleX(${
                blockWidth / 100
              })`,
              transformOrigin: "left",
              width: "100%",
              backgroundColor: block.color,
            }}
            title={`${block.appName}\n${
              block.windowName
            }\n${block.startTime.toLocaleTimeString()} - ${block.endTime.toLocaleTimeString()}`}
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
