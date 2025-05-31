"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface DiskUsedByPipes {
  pipes: [string, string][];
  total_pipes_size: string;
}

export interface DiskUsedByMedia {
  videos_size: string;
  audios_size: string;
  total_media_size: string;
}

export interface DiskUsage {
  pipes: DiskUsedByPipes;
  media: DiskUsedByMedia;
  total_data_size: string;
  total_cache_size: string;
  avaiable_space: string;
}

export function useDiskUsage() {
  const [diskUsage, setDiskUsage] = useState<DiskUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDiskUsage = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await invoke<DiskUsage>("get_disk_usage");
      setDiskUsage(result);
    } catch (err) {
      console.error("Failed to fetch disk usage:", err);
      setError(err as string);
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
    refetch: fetchDiskUsage,
  };
} 