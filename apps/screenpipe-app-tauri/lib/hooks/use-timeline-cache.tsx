import localforage from "localforage";
import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";

// Configure localforage for timeline cache
const timelineCache = localforage.createInstance({
  name: "screenpipe",
  storeName: "timeline_cache",
});

const CACHE_KEY = "cached_frames";
const CACHE_DATE_KEY = "cached_date";
const CACHE_TIMESTAMP_KEY = "cache_timestamp";
const MAX_CACHED_FRAMES = 200; // Keep last 200 frames for instant load

export interface TimelineCache {
  frames: StreamTimeSeriesResponse[];
  date: string; // ISO date string
  timestamp: number; // When cache was saved
}

/**
 * Save frames to cache for instant load on next app open
 */
export async function saveFramesToCache(
  frames: StreamTimeSeriesResponse[],
  date: Date
): Promise<void> {
  try {
    // Only cache the most recent frames to keep storage reasonable
    const framesToCache = frames.slice(0, MAX_CACHED_FRAMES);
    
    await timelineCache.setItem(CACHE_KEY, framesToCache);
    await timelineCache.setItem(CACHE_DATE_KEY, date.toISOString());
    await timelineCache.setItem(CACHE_TIMESTAMP_KEY, Date.now());
  } catch (error) {
    console.warn("Failed to save frames to cache:", error);
  }
}

/**
 * Load cached frames for instant display
 */
export async function loadCachedFrames(): Promise<TimelineCache | null> {
  try {
    const frames = await timelineCache.getItem<StreamTimeSeriesResponse[]>(CACHE_KEY);
    const dateStr = await timelineCache.getItem<string>(CACHE_DATE_KEY);
    const timestamp = await timelineCache.getItem<number>(CACHE_TIMESTAMP_KEY);

    if (!frames || frames.length === 0 || !dateStr) {
      return null;
    }

    return {
      frames,
      date: dateStr,
      timestamp: timestamp || Date.now(),
    };
  } catch (error) {
    console.warn("Failed to load cached frames:", error);
    return null;
  }
}

/**
 * Check if we have any cached data (for determining UI state)
 */
export async function hasCachedData(): Promise<boolean> {
  try {
    const frames = await timelineCache.getItem<StreamTimeSeriesResponse[]>(CACHE_KEY);
    return frames !== null && frames.length > 0;
  } catch {
    return false;
  }
}

/**
 * Clear the cache (useful for debugging or user-initiated clear)
 */
export async function clearTimelineCache(): Promise<void> {
  try {
    await timelineCache.clear();
  } catch (error) {
    console.warn("Failed to clear timeline cache:", error);
  }
}

/**
 * Get cache age in milliseconds
 */
export async function getCacheAge(): Promise<number | null> {
  try {
    const timestamp = await timelineCache.getItem<number>(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return null;
    return Date.now() - timestamp;
  } catch {
    return null;
  }
}
