import React, { useEffect, useState, useCallback, useMemo } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { invoke } from "@tauri-apps/api/core";
import { StreamTimeSeriesResponse } from "@/app/timeline/page";
import { stringToColor } from "@/lib/utils";
import { motion, useAnimation } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTimelineSelection } from "@/lib/hooks/use-timeline-selection";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus, Volume2 } from "lucide-react";

// Add this near the top of the file, after imports
const GAP_THRESHOLD = 3 * 60 * 1000; // 5 minutes in milliseconds

interface ProcessedBlock {
  appName: string;
  percentThroughDay: number;
  timestamp: Date;
  iconSrc?: string;
  windows: Array<{
    title: string;
    timestamp: Date;
  }>;
}

export function TimelineIconsSection({
  blocks,
}: {
  blocks: StreamTimeSeriesResponse[];
}) {
  const [iconCache, setIconCache] = useState<{ [key: string]: string }>({});

  // Get the visible time range
  const timeRange = useMemo(() => {
    if (blocks.length === 0) return null;
    const startTime = new Date(blocks[blocks.length - 1].timestamp);
    const endTime = new Date(blocks[0].timestamp);
    return { start: startTime, end: endTime };
  }, [blocks]);

  // Combine both computations into one useMemo
  const { processedBlocks, processedAudioGroups } = useMemo(() => {
    if (!timeRange) return { processedBlocks: [], processedAudioGroups: [] };

    // Process audio groups first
    const audioGroups = blocks
      .flatMap(frame => 
        frame.devices.flatMap(device => 
          device.audio.map(audio => ({
            deviceName: audio.device_name,
            isInput: audio.is_input,
            timestamp: new Date(frame.timestamp),
            duration: audio.duration_secs,
            percentThroughDay: 
              ((new Date(frame.timestamp).getTime() - timeRange.start.getTime()) /
              (timeRange.end.getTime() - timeRange.start.getTime())) * 100
          }))
        )
      )
      .filter(audio => {
        const timestamp = audio.timestamp;
        return timestamp >= timeRange.start && timestamp <= timeRange.end;
      })
      .filter((audio, index, array) => {
        if (index === 0) return true;
        const prevAudio = array[index - 1];
        return Math.abs(audio.percentThroughDay - prevAudio.percentThroughDay) > 0.25;
      });

    // Process app blocks (existing logic)
    const appGroups: {
      [key: string]: Array<{
        timestamp: Date;
        title?: string;
        blockId?: number;
      }>;
    } = {};

    blocks.forEach((frame) => {
      frame.devices.forEach((device) => {
        if (!device.metadata?.app_name) return;

        const timestamp = new Date(frame.timestamp);
        const appName = device.metadata.app_name;
        const windowTitle = device.metadata.window_name;

        if (timestamp < timeRange.start || timestamp > timeRange.end) return;

        if (!appGroups[appName]) {
          appGroups[appName] = [];
        }
        appGroups[appName].push({ timestamp, title: windowTitle });
      });
    });

    Object.entries(appGroups).forEach(([appName, timestamps]) => {
      timestamps.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      let currentBlockId = 0;
      let blockStart = timestamps[0];
      let lastTimestamp = timestamps[0];

      timestamps.forEach((entry, idx) => {
        if (
          entry.timestamp.getTime() - lastTimestamp.timestamp.getTime() >
          GAP_THRESHOLD
        ) {
          currentBlockId++;
          blockStart = entry;
        }
        entry.blockId = currentBlockId;
        lastTimestamp = entry;
      });
    });

    const b: ProcessedBlock[] = [];

    Object.entries(appGroups).forEach(([appName, entries]) => {
      const blockIds = [...new Set(entries.map((e) => e.blockId))];

      blockIds.forEach((blockId) => {
        const blockEntries = entries.filter((e) => e.blockId === blockId);
        if (blockEntries.length === 0) return;

        const blockStart = blockEntries[0].timestamp;
        const blockEnd = blockEntries[blockEntries.length - 1].timestamp;
        const blockMiddle = new Date(
          blockStart.getTime() + (blockEnd.getTime() - blockStart.getTime()) / 2
        );

        const windowsInBlock = blockEntries
          .filter((w) => w.title) // only keep windows with titles
          .map((w) => ({
            title: w.title!,
            timestamp: w.timestamp,
          }))
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // most recent first

        b.push({
          appName,
          timestamp: blockMiddle,
          percentThroughDay:
            ((blockMiddle.getTime() - timeRange.start.getTime()) /
              (timeRange.end.getTime() - timeRange.start.getTime())) *
            100,
          iconSrc: iconCache[appName],
          windows: windowsInBlock,
        });
      });
    });

    return {
      processedBlocks: b
        .sort((a, b) => a.percentThroughDay - b.percentThroughDay)
        .filter((block, index, array) => {
          if (index === 0) return true;
          const prevBlock = array[index - 1];
          return Math.abs(block.percentThroughDay - prevBlock.percentThroughDay) > 0.25;
        }),
      processedAudioGroups: audioGroups
    };
  }, [blocks, iconCache, timeRange]);

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
    <div className="absolute -top-8 inset-x-0 h-8">
      {processedBlocks.map((block, i) => {
        const bgColor = stringToColor(block.appName);

        return (
          <motion.div
            key={`${block.appName}-${i}`}
            className="absolute h-full pointer-events-auto cursor-pointer"
            style={{
              left: `${block.percentThroughDay}%`,
              transform: "translateX(-50%)",
              zIndex: 50,
            }}
            onMouseEnter={() => {
              console.log("hover on:", block.appName);
            }}
            whileHover={{
              scale: 1.5,
              backgroundColor: "red",
              y: -20,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
          >
            {block.iconSrc ? (
              <motion.div
                className="w-5 h-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  backgroundColor: `${bgColor}40`,
                  padding: "2px",
                }}
              >
                <img
                  src={`data:image/png;base64,${block.iconSrc}`}
                  className="w-full h-full opacity-70"
                  alt={block.appName}
                  loading="lazy"
                  decoding="async"
                />
              </motion.div>
            ) : (
              <motion.div
                className="w-5 h-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: bgColor }}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
