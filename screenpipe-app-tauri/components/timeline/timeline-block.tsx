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

  // Optimize block calculation by sampling frames
  const blocks = useMemo(() => {
    if (frames.length === 0) return [];

    // Sample frames based on time range duration
    const timeRangeMs = timeRange.end.getTime() - timeRange.start.getTime();
    const sampleInterval = Math.max(1, Math.floor(timeRangeMs / 200)); // Adjust 200 to control detail level
    
    const sampledFrames = frames.filter((_, index) => index % sampleInterval === 0);
    
    const blocks: TimeBlock[] = [];
    let currentBlock: TimeBlock | null = null;

    sampledFrames
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach((frame) => {
        const timestamp = new Date(frame.timestamp);
        const appName = frame.devices[0].metadata.app_name;

        if (timestamp < timeRange.start || timestamp > timeRange.end) return;

        if (!currentBlock) {
          currentBlock = {
            appName,
            startTime: timestamp,
            endTime: timestamp,
            color: getAppColor(appName),
          };
        } else if (currentBlock.appName !== appName) {
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

    if (currentBlock) blocks.push(currentBlock);
    return blocks;
  }, [frames, timeRange, colorCache]);

  // Optimize rendering by using CSS transform instead of percentage calculations
  return (
    <div className="absolute inset-0">
      {blocks.map((block, index) => {
        const totalMs = timeRange.end.getTime() - timeRange.start.getTime();
        const blockStart = (block.startTime.getTime() - timeRange.start.getTime()) / totalMs;
        const blockWidth = (block.endTime.getTime() - block.startTime.getTime()) / totalMs;

        if (blockWidth < 0.001) return null; // Skip tiny blocks

        return (
          <div
            key={`${block.appName}-${index}`}
            className="absolute top-0 h-full"
            style={{
              transform: `translateX(${blockStart * 100}%)`,
              width: `${blockWidth * 100}%`,
              backgroundColor: block.color,
              willChange: 'transform',
            }}
            title={`${block.appName}\n${block.startTime.toLocaleTimeString()} - ${block.endTime.toLocaleTimeString()}`}
          />
        );
      })}
    </div>
  );
}
