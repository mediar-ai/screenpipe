import { StreamTimeSeriesResponse } from "@/app/timeline/page";
import { useMemo } from "react";

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
    visibleStart?: Date;
    visibleEnd?: Date;
  };
}

export function TimelineBlocks({ frames, timeRange }: TimelineBlocksProps) {
  // Cache colors to avoid recalculating
  const colorCache = useMemo(() => new Map<string, string>(), []);

  const getAppColor = (appName: string): string => {
    const cached = colorCache.get(appName);
    if (cached) return cached;

    let hash = 0;
    for (let i = 0; i < appName.length; i++) {
      hash = appName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    const color = `hsl(${hue}, 70%, 50%)`;
    colorCache.set(appName, color);
    return color;
  };

  // Calculate blocks without sampling
  const blocks = useMemo(() => {
    if (frames.length === 0) return [];

    const blocks: TimeBlock[] = [];
    let currentBlock: TimeBlock | null = null;

    // Sort frames by timestamp first
    const sortedFrames = [...frames].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sortedFrames.forEach((frame) => {
      const timestamp = new Date(frame.timestamp);
      // Ensure we have devices data
      if (!frame.devices?.[0]?.metadata?.app_name) return;

      const appName = frame.devices[0].metadata.app_name;
      const windowName = frame.devices[0].metadata.window_name;
      if (timestamp < timeRange.start || timestamp > timeRange.end) return;

      if (!currentBlock) {
        currentBlock = {
          appName,
          windowName,
          startTime: timestamp,
          endTime: timestamp,
          color: getAppColor(appName),
        };
      } else if (currentBlock.appName !== appName) {
        blocks.push(currentBlock);
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
    });

    if (currentBlock) blocks.push(currentBlock);
    return blocks;
  }, [frames, timeRange, getAppColor]);

  // Debug output
  console.log("timeline blocks:", blocks);

  return (
    <div className="absolute inset-0 flex flex-col">
      {blocks.map((block, index) => {
        // Calculate position relative to visible range instead of 24-hour scale
        const visibleStartTime = timeRange.visibleStart || timeRange.start;
        const visibleEndTime = timeRange.visibleEnd || timeRange.end;
        const visibleRangeMs =
          visibleEndTime.getTime() - visibleStartTime.getTime();

        const blockStartMs =
          block.startTime.getTime() - visibleStartTime.getTime();
        const blockDurationMs =
          block.endTime.getTime() - block.startTime.getTime();

        // Calculate percentages based on visible range
        const blockStart = (blockStartMs / visibleRangeMs) * 100;
        const blockWidth = (blockDurationMs / visibleRangeMs) * 100;

        if (blockWidth < 0.01) return null; // Skip tiny blocks

        return (
          <div
            key={`${block.appName}-${index}`}
            className="absolute top-0 bottom-0 opacity-50 hover:opacity-80 transition-opacity z-10"
            style={{
              left: `${blockStart}%`,
              width: `${blockWidth}%`,
              backgroundColor: block.color,
              willChange: "transform",
            }}
            title={`${block.appName}\n${
              block.windowName
            }\n${block.startTime.toLocaleTimeString()} - ${block.endTime.toLocaleTimeString()}`}
          />
        );
      })}
    </div>
  );
}
