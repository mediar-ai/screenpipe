import { cn } from "@/lib/utils";

interface CurrentTimeIndicatorProps {
  currentFrame: {
    metadata: {
      timestamp: string;
    };
  } | null;
  frames: any[]; // Replace with your StreamTimeSeriesResponse type
  currentIndex: number;
  timeRange: {
    start: Date;
    end: Date;
  };
  className?: string;
}

export function CurrentTimeIndicator({
  currentFrame,
  frames,
  currentIndex,
  timeRange,
  className,
}: CurrentTimeIndicatorProps) {
  const getCurrentTimePercentage = () => {
    if (!currentFrame) return 0;

    const frameTime = new Date(
      currentFrame.metadata.timestamp || frames[currentIndex].timestamp
    );

    const totalMs = timeRange.end.getTime() - timeRange.start.getTime();
    const currentMs = frameTime.getTime() - timeRange.start.getTime();

    return (currentMs / totalMs) * 100;
  };

  if (!currentFrame) return null;

  return (
    <div
      className={cn(
        "absolute top-0 bottom-0 flex flex-col items-center pointer-events-none z-10",
        className
      )}
      style={{
        left: `${Math.max(0, Math.min(100, getCurrentTimePercentage()))}%`,
      }}
    >
      <div className="w-0.5 h-full bg-foreground/50" />
      <div className="absolute bottom-[-20px] text-xs text-foreground bg-background px-1 rounded-sm border whitespace-nowrap">
        {new Date(
          currentFrame.metadata.timestamp || frames[currentIndex].timestamp
        ).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}
      </div>
    </div>
  );
}
