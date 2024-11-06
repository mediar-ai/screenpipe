import { useMemo } from "react";

interface TimeBlock {
  appName: string;
  startTime: Date;
  endTime: Date;
  color: string;
}

interface TimelineBlocksProps {
  frames: any[]; // Replace with your StreamTimeSeriesResponse type
  timeRange: { start: Date; end: Date };
}

export function TimelineBlocks({ frames, timeRange }: TimelineBlocksProps) {
  // Move helper functions inside component
  const getAppColor = (appName: string): string => {
    let hash = 0;
    for (let i = 0; i < appName.length; i++) {
      hash = appName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  // Memoize the heavy calculation
  const blocks = useMemo(() => {
    if (frames.length === 0) return [];

    const blocks: TimeBlock[] = [];
    let currentBlock: TimeBlock | null = null;

    const sortedFrames = [...frames].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sortedFrames.forEach((frame) => {
      const timestamp = new Date(frame.timestamp);
      const appName = frame.devices[0].metadata.app_name;

      if (timestamp < timeRange.start || timestamp > timeRange.end) {
        return;
      }

      if (!currentBlock) {
        currentBlock = {
          appName,
          startTime: timestamp,
          endTime: timestamp,
          color: getAppColor(appName),
        };
      } else if (currentBlock.appName !== appName) {
        currentBlock.endTime = timestamp;
        blocks.push(currentBlock);
        currentBlock = {
          appName,
          startTime: timestamp,
          endTime: timestamp,
          color: getAppColor(appName),
        };
      } else {
        currentBlock.endTime = timestamp;
      }
    });

    if (currentBlock) {
      blocks.push(currentBlock);
    }

    return blocks;
  }, [frames, timeRange]);

  return (
    <>
      {blocks.map((block, index) => {
        const totalMs = timeRange.end.getTime() - timeRange.start.getTime();
        const blockStart =
          ((block.startTime.getTime() - timeRange.start.getTime()) / totalMs) *
          100;
        const blockWidth =
          ((block.endTime.getTime() - block.startTime.getTime()) / totalMs) *
          100;

        return (
          <div
            key={index}
            className="absolute top-0 h-full"
            style={{
              left: `${Math.max(0, Math.min(100, blockStart))}%`,
              width: `${Math.max(0, Math.min(100 - blockStart, blockWidth))}%`,
              backgroundColor: block.color,
              transition: "all 0.1s ease-in-out",
            }}
            title={`${
              block.appName
            }\n${block.startTime.toLocaleTimeString()} - ${block.endTime.toLocaleTimeString()}`}
          />
        );
      })}
    </>
  );
}
