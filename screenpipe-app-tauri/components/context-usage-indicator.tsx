import React from "react";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle } from "lucide-react";

interface ContextUsageIndicatorProps {
  currentSize: number;
  maxSize: number;
}

export function ContextUsageIndicator({
  currentSize,
  maxSize,
}: ContextUsageIndicatorProps) {
  const percentage = Math.min((currentSize / maxSize) * 100, 100);

  return (
    <div className="w-5 h-5 relative">
      {/* <svg className="w-full h-full" viewBox="0 0 36 36">
        <path
          className="text-gray-300"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="100"
          strokeDashoffset={100 - percentage}
        />
        
      </svg> */}
      {percentage > 90 && <AlertTriangle className="w-6 h-6 " />}
    </div>
  );
}
