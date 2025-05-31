"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Badge } from "../ui/badge";
import { useDiskUsage } from "@/lib/hooks/use-disk-usage";
import { RefreshCw, HardDrive, Folder, Video, Mic, Database } from "lucide-react";
import { Skeleton } from "../ui/skeleton";

export function DiskUsageSection() {
  const { diskUsage, isLoading, error, refetch } = useDiskUsage();

  const handleRefresh = () => {
    refetch();
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">Disk Usage</h3>
          <p className="text-sm text-muted-foreground">
            Monitor storage usage for your Screenpipe data
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-500">
              <p>Failed to load disk usage: {error}</p>
              <Button onClick={handleRefresh} variant="outline" className="mt-2">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Disk Usage</h3>
          <p className="text-sm text-muted-foreground">
            Monitor storage usage for your Screenpipe data at ~/.screenpipe/data
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Data Size</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{diskUsage?.total_data_size || "---"}</div>
            )}
            <p className="text-xs text-muted-foreground">
              All Screenpipe data
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Size</CardTitle>
            <Folder className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{diskUsage?.total_cache_size || "---"}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Temporary files
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Space</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-green-600">{diskUsage?.avaiable_space || "---"}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Free disk space
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Media Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Media Files
          </CardTitle>
          <CardDescription>
            Breakdown of recorded media files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Video Files</span>
                </div>
                <Badge variant="secondary">{diskUsage?.media.videos_size || "---"}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Audio Files</span>
                </div>
                <Badge variant="secondary">{diskUsage?.media.audios_size || "---"}</Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between font-medium">
                <span>Total Media Size</span>
                <Badge>{diskUsage?.media.total_media_size || "---"}</Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>


    </div>
  );
} 