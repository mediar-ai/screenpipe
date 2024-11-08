import React, { useEffect, useState, useCallback, useMemo } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { invoke } from "@tauri-apps/api/core";
import { StreamTimeSeriesResponse } from "@/app/timeline/page";
import { stringToColor } from "@/lib/utils";

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

    const appGroups: { [key: string]: Date[] } = {};

    blocks.forEach((frame) => {
      // Show all devices without filtering
      frame.devices.forEach((device) => {
        if (!device.metadata?.app_name) return;
        
        const timestamp = new Date(frame.timestamp);
        const appName = device.metadata.app_name;

        if (timestamp < timeRange.start || timestamp > timeRange.end) return;

        if (!appGroups[appName]) {
          appGroups[appName] = [];
        }
        appGroups[appName].push(timestamp);
      });
    });

    const b: ProcessedBlock[] = [];

    Object.entries(appGroups).forEach(([appName, timestamps]) => {
      timestamps.sort((a, b) => a.getTime() - b.getTime());

      // Changed from 30s to 15s for a more balanced approach
      const GAP_THRESHOLD = 15000; // 15 seconds in milliseconds
      let blockStart = timestamps[0];
      let lastTimestamp = timestamps[0];

      timestamps.forEach((timestamp) => {
        if (timestamp.getTime() - lastTimestamp.getTime() > GAP_THRESHOLD) {
          b.push({
            appName,
            timestamp: new Date(
              blockStart.getTime() +
                (lastTimestamp.getTime() - blockStart.getTime()) / 2
            ),
            percentThroughDay:
              ((blockStart.getTime() +
                (lastTimestamp.getTime() - blockStart.getTime()) / 2 -
                timeRange.start.getTime()) /
                (timeRange.end.getTime() - timeRange.start.getTime())) *
              100,
            iconSrc: iconCache[appName],
          });
          blockStart = timestamp;
        }
        lastTimestamp = timestamp;
      });

      // Always add the last block
      b.push({
        appName,
        timestamp: new Date(
          blockStart.getTime() +
            (lastTimestamp.getTime() - blockStart.getTime()) / 2
        ),
        percentThroughDay:
          ((blockStart.getTime() +
            (lastTimestamp.getTime() - blockStart.getTime()) / 2 -
            timeRange.start.getTime()) /
            (timeRange.end.getTime() - timeRange.start.getTime())) *
          100,
        iconSrc: iconCache[appName],
      });
    });

    // Changed from 0.1% to 0.25% for better spacing while still showing more icons
    return b
      .sort((a, b) => a.percentThroughDay - b.percentThroughDay)
      .filter((block, index, array) => {
        if (index === 0) return true;
        const prevBlock = array[index - 1];
        return (
          Math.abs(block.percentThroughDay - prevBlock.percentThroughDay) > 0.25
        );
      });
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
    <div className="absolute -top-8 inset-x-0 pointer-events-none h-8">
      {processedBlocks.map((block, i) => {
        const bgColor = stringToColor(block.appName);
        return (
          <div
            key={`${block.appName}-${i}`}
            className="absolute top-0 h-full w-full"
            style={{
              left: `${block.percentThroughDay}%`,
              transform: "translateX(-50%)",
            }}
          >
            {block.iconSrc ? (
              <div
                className="w-5 h-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  backgroundColor: `${bgColor}40`, // 40 is for 25% opacity
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
              </div>
            ) : (
              <div
                className="w-5 h-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: bgColor }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
