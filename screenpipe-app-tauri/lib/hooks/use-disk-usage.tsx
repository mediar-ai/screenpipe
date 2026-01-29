"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface DiskUsedByMedia {
  videos_size: string;
  audios_size: string;
  total_media_size: string;
}

export interface DiskUsage {
  media: DiskUsedByMedia;
  total_data_size: string;
  total_cache_size: string;
  available_space: string;
}

export function useDiskUsage() {
  const [diskUsage, setDiskUsage] = useState<DiskUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDiskUsage = async (forceRefresh: boolean = false) => {
    try {
      setIsLoading(true);
      setError(null);

      // Add a small delay to show loading state for very fast calculations
      const [result] = await Promise.all([
        invoke<DiskUsage>("get_disk_usage", { forceRefresh }),
        new Promise(resolve => setTimeout(resolve, forceRefresh ? 300 : 500)) // Shorter delay on force refresh
      ]);
      
      setDiskUsage(result);
    } catch (err) {
      console.error("Failed to fetch disk usage:", err);
      
      // Provide more user-friendly error messages
      let errorMessage = "Unknown error occurred";
      if (typeof err === "string") {
        errorMessage = err;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === "object" && "message" in err) {
        errorMessage = String(err.message);
      }
      
      // Handle common error scenarios
      if (errorMessage.includes("permission") || errorMessage.includes("access")) {
        errorMessage = "Permission denied. Please check file access permissions.";
      } else if (errorMessage.includes("not found") || errorMessage.includes("directory")) {
        errorMessage = "Screenpipe data directory not found. Make sure Screenpipe has been initialized.";
      } else if (errorMessage.includes("timeout")) {
        errorMessage = "Calculation timed out. Try again or check for very large datasets.";
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiskUsage();
  }, []);

  return {
    diskUsage,
    isLoading,
    error,
    refetch: () => fetchDiskUsage(true), // Force refresh when user clicks refresh
  };
} 