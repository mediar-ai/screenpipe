import { cn } from "@/lib/utils";

interface TimeLabelsProps {
  timeRange: {
    start: Date;
    end: Date;
  };
  className?: string;
}

export function TimeLabels({ timeRange, className }: TimeLabelsProps) {
  const totalHours =
    (timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60);
  const labelCount = Math.min(7, Math.ceil(totalHours / 2)); // One label every ~2 hours, max 7 labels

  return (
    <div
      className={cn(
        "flex items-center justify-start px-6 text-[10px] text-muted-foreground absolute bottom-2 w-full",
        className
      )}
    >
      {Array(labelCount)
        .fill(0)
        .map((_, i) => {
          const msPerLabel =
            (timeRange.end.getTime() - timeRange.start.getTime()) /
            (labelCount - 1);
          const timestamp = new Date(
            timeRange.start.getTime() + i * msPerLabel
          );

          return (
            <div
              key={i}
              className="absolute transform -translate-x-1/2"
              style={{ left: `${(i * 100) / (labelCount - 1)}%` }}
            >
              {timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          );
        })}
    </div>
  );
}
