"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Badge } from "../ui/badge";
import { useDiskUsage } from "@/lib/hooks/use-disk-usage";
import { RefreshCw, HardDrive, Folder, Video, Mic, Database, Calculator } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import { Progress } from "../ui/progress";

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
          {isLoading ? "Calculating..." : "Refresh"}
        </Button>
      </div>

      {/* Loading Progress Indicator */}
      {isLoading && (
        <Card className="border-border bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <Calculator className="h-5 w-5 text-foreground animate-pulse" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Calculating disk usage...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Scanning directories and analyzing file sizes. This may take a moment for large datasets.
                </p>
                <Progress value={undefined} className="mt-3 h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={isLoading ? "opacity-75" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Data Size</CardTitle>
            <Database className={`h-4 w-4 text-muted-foreground ${isLoading ? "animate-pulse" : ""}`} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">{diskUsage?.total_data_size || "0 KB"}</div>
                <p className="text-xs text-muted-foreground">
                  All Screenpipe data
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className={isLoading ? "opacity-75" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Size</CardTitle>
            <Folder className={`h-4 w-4 text-muted-foreground ${isLoading ? "animate-pulse" : ""}`} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">{diskUsage?.total_cache_size || "0 KB"}</div>
                <p className="text-xs text-muted-foreground">
                  Temporary files
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className={isLoading ? "opacity-75" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Space</CardTitle>
            <HardDrive className={`h-4 w-4 text-muted-foreground ${isLoading ? "animate-pulse" : ""}`} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">{diskUsage?.available_space || "Unknown"}</div>
                <p className="text-xs text-muted-foreground">
                  Free disk space
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Media Breakdown */}
      <Card className={isLoading ? "opacity-75" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className={`h-5 w-5 ${isLoading ? "animate-pulse" : ""}`} />
            Media Files
          </CardTitle>
          <CardDescription>
            Breakdown of recorded media files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-px w-full" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calculator className="h-4 w-4 animate-pulse" />
                  <span>Analyzing media files recursively...</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Video Files</span>
                </div>
                <Badge variant="secondary">{diskUsage?.media.videos_size || "0 KB"}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Audio Files</span>
                </div>
                <Badge variant="secondary">{diskUsage?.media.audios_size || "0 KB"}</Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between font-medium">
                <span>Total Media Size</span>
                <Badge className="bg-primary">{diskUsage?.media.total_media_size || "0 KB"}</Badge>
              </div>
              {diskUsage && (
                <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    ✓ Values calculated from recursive directory scan including all subdirectories
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 