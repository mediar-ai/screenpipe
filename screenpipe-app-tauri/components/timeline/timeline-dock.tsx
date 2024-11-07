import React, { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { platform } from "@tauri-apps/plugin-os";
import { invoke } from "@tauri-apps/api/core";
import { debounce } from "lodash";
import { StreamTimeSeriesResponse } from "@/app/timeline/page";

interface TimelineDockProps {
  children: React.ReactNode;
  magnification?: number;
  distance?: number;
  className?: string;
}

interface TimelineDockIconProps {
  children: React.ReactNode;
  className?: string;
  timestamp?: Date;
  appName?: string;
  mouseX?: number | null;
  index?: number;
  magnification?: number;
  distance?: number;
  style?: React.CSSProperties;
}

export function TimelineDock({
  children,
  magnification = 2,
  distance = 100,
  className,
}: TimelineDockProps) {
  const [mouseX, setMouseX] = React.useState<null | number>(null);

  // Debounce mouse move handler
  const handleMouseMove = useMemo(
    () =>
      debounce((e: React.MouseEvent) => {
        if (!e.currentTarget) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        setMouseX(e.clientX - bounds.left);
      }, 16), // ~60fps
    []
  );

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setMouseX(null)}
      className={cn(
        "flex items-center justify-start h-8 relative px-2 w-full",
        className
      )}
    >
      {useMemo(
        () =>
          React.Children.map(children, (child, index) => {
            if (!React.isValidElement(child)) return null;
            return React.cloneElement(
              child as React.ReactElement<TimelineDockIconProps>,
              {
                mouseX,
                index,
                magnification,
                distance,
              }
            );
          }),
        [children, mouseX, magnification, distance]
      )}
    </motion.div>
  );
}

// Memoize the TimelineDockIcon component
export const TimelineDockIcon = React.memo(function TimelineDockIcon({
  children,
  className,
  timestamp,
  appName,
  mouseX,
  index,
  magnification = 2,
  distance = 50,
  style,
}: TimelineDockIconProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  // Calculate scale based on percentage position rather than pixel position
  let scale = 1;
  let isClosest = false;
  let spacing = 0;

  if (mouseX != null && style?.left) {
    // Convert left percentage to actual position
    const iconPosition = parseFloat(style.left as string);
    const mousePosition =
      (mouseX / (ref.current?.parentElement?.offsetWidth || 1)) * 100;

    // Calculate distance as percentage difference
    const distanceFromMouse = Math.abs(mousePosition - iconPosition);

    if (distanceFromMouse < 5) {
      // Reduced distance threshold to 5%
      scale = Math.max(
        1,
        magnification - (distanceFromMouse / 5) * magnification
      );

      spacing = scale > 1 ? 2 * (1 - distanceFromMouse / 5) : 0;
      isClosest = distanceFromMouse < 2; // Show tooltip when within 2%
    }
  }

  const yOffset = scale > 1 ? (scale - 1) * 16 : 0;
  const xOffset = mouseX != null ? spacing : 0;

  return (
    <motion.div
      ref={ref}
      style={{
        scale,
        y: -yOffset,
        x: xOffset,
        zIndex: scale > 1 ? 1 : 0,
        position: "absolute",
        transform: `translate(-50%, -50%)`,
        ...style,
      }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 25,
      }}
      className={cn(
        "flex items-center justify-center w-4 h-4 origin-center",
        className
      )}
    >
      <div className="relative flex items-center justify-center">
        {children}
        <AnimatePresence>
          {isClosest && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full mt-2 left-1/2 -translate-x-1/2 flex flex-col items-center bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md border shadow-sm text-xs whitespace-nowrap"
            >
              <span>{appName}</span>
              <span>{timestamp?.toLocaleTimeString()}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

interface ProcessedBlock {
  appName: string;
  percentThroughDay: number;
  timestamp: Date;
  iconSrc?: string;
}

export function TimelineIconsSection({
  blocks,
}: {
  blocks: StreamTimeSeriesResponse[];
}) {
  const [iconCache, setIconCache] = useState<{ [key: string]: string }>({});

  // Memoize significant blocks calculation
  const significantBlocks = useMemo(
    () =>
      blocks.filter((block) => {
        return block.devices.every((device) => device.metadata.app_name);
      }),
    [blocks]
  );

  // Get the visible time range
  const timeRange = useMemo(() => {
    if (blocks.length === 0) return null;
    const startTime = new Date(blocks[blocks.length - 1].timestamp);
    const endTime = new Date(blocks[0].timestamp);
    return { start: startTime, end: endTime };
  }, [blocks]);

  // Memoize processed blocks with position calculations
  const processedBlocks = useMemo<ProcessedBlock[]>(() => {
    if (!timeRange) return [];

    // Use the same block calculation logic as timeline-block.tsx
    const blocks: {
      appName: string;
      startTime: Date;
      endTime: Date;
    }[] = [];
    
    let currentBlock: {
      appName: string;
      startTime: Date;
      endTime: Date;
    } | null = null;

    // Sort frames by timestamp first
    const sortedFrames = [...significantBlocks].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sortedFrames.forEach((frame) => {
      const timestamp = new Date(frame.timestamp);
      // Ensure we have devices data
      if (!frame.devices?.[0]?.metadata?.app_name) return;

      const appName = frame.devices[0].metadata.app_name;
      if (timestamp < timeRange.start || timestamp > timeRange.end) return;

      if (!currentBlock) {
        currentBlock = {
          appName,
          startTime: timestamp,
          endTime: timestamp,
        };
      } else if (currentBlock.appName !== appName) {
        blocks.push(currentBlock);
        currentBlock = {
          appName,
          startTime: timestamp,
          endTime: timestamp,
        };
      } else {
        currentBlock.endTime = timestamp;
      }
    });

    if (currentBlock) blocks.push(currentBlock);

    console.log("Initial blocks:", blocks);

    // Convert blocks to icons
    // Only show icons for blocks that are longer than 5% of total time
    const totalRange = timeRange.end.getTime() - timeRange.start.getTime();
    const minDuration = totalRange * 0.05;

    return blocks
      .filter(block => {
        const duration = block.endTime.getTime() - block.startTime.getTime();
        return duration > minDuration;
      })
      .map(block => {
        // Place icon at the middle of the block
        const middleTime = new Date(
          block.startTime.getTime() + 
          (block.endTime.getTime() - block.startTime.getTime()) / 2
        );
        
        const percentPosition =
          ((middleTime.getTime() - timeRange.start.getTime()) / totalRange) * 100;

        return {
          appName: block.appName,
          percentThroughDay: percentPosition,
          timestamp: middleTime,
          iconSrc: iconCache[block.appName],
        };
      })
      .filter((block, index, array) => {
        if (index === 0) return true;
        const prevBlock = array[index - 1];
        // Ensure icons don't overlap
        return Math.abs(block.percentThroughDay - prevBlock.percentThroughDay) > 3;
      });
  }, [significantBlocks, iconCache, timeRange]);

  const loadAppIcon = useCallback(
    async (appName: string, appPath?: string) => {
      try {
        // Check platform first to avoid unnecessary invokes
        const p = platform();
        if (p !== "macos") return; // Early return for unsupported platforms

        if (iconCache[appName]) return;

        const icon = await invoke<{ base64: string; path: string } | null>(
          "get_app_icon",
          { appName, appPath }
        );

        if (icon?.base64) {
          // Add null check for base64
          setIconCache((prev) => ({
            ...prev,
            [appName]: icon.base64,
          }));
        }
      } catch (error) {
        console.error(`failed to load icon for ${appName}:`, error);
        // Fail silently - the UI will just not show an icon
      }
    },
    [iconCache]
  );

  useEffect(() => {
    const loadIcons = async () => {
      const p = platform();
      if (p !== "macos") return;

      // Load icons for unique app names only
      processedBlocks.forEach((block) => {
        loadAppIcon(block.appName);
      });
    };

    loadIcons();
  }, [processedBlocks, loadAppIcon]);

  return (
    <div className="absolute -top-12 inset-x-0 pointer-events-none h-8">
      {processedBlocks.map((block, i) => (
        <div
          key={`${block.appName}-${i}`}
          className="absolute top-0 h-full w-full"
          style={{
            left: `${block.percentThroughDay}%`,
            transform: "translateX(-50%)",
          }}
        >
          {block.iconSrc && (
            <img
              src={`data:image/png;base64,${block.iconSrc}`}
              className="w-5 h-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-70"
              alt={block.appName}
              loading="lazy"
              decoding="async"
            />
          )}
        </div>
      ))}
    </div>
  );
}
