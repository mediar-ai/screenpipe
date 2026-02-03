"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  HardDrive,
  Film,
  Clock,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface RewindScanResult {
  available: boolean;
  total_video_files: number;
  total_size_bytes: number;
  total_size_formatted: string;
  estimated_frame_count: number;
  already_imported_count: number;
  rewind_path: string;
}

interface MigrationProgress {
  state: string;
  total_videos: number;
  videos_processed: number;
  frames_imported: number;
  frames_skipped: number;
  current_video: string | null;
  percent_complete: number;
  error_message: string | null;
}

export function RewindIntegrationCard() {
  const [isChecking, setIsChecking] = useState(true);
  const [isAvailable, setIsAvailable] = useState(false);
  const [scanResult, setScanResult] = useState<RewindScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAvailability();
  }, []);

  useEffect(() => {
    if (!isMigrating) return;

    const interval = setInterval(async () => {
      try {
        const p = await invoke<MigrationProgress>("rewind_get_progress");
        setProgress(p);

        if (p.state === "completed") {
          setIsMigrating(false);
          toast({
            title: "Import Complete! 🎉",
            description: `Imported ${p.frames_imported.toLocaleString()} frames from Rewind.`,
          });
          scanRewindData();
        } else if (p.state === "failed") {
          setIsMigrating(false);
          setError(p.error_message || "Import failed");
        } else if (p.state === "cancelled") {
          setIsMigrating(false);
        }
      } catch (e) {
        console.error("Failed to get progress:", e);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isMigrating]);

  useEffect(() => {
    const unlisten = listen<MigrationProgress>("rewind-migration-complete", (event) => {
      setProgress(event.payload);
      setIsMigrating(false);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const checkAvailability = async () => {
    setIsChecking(true);
    try {
      const available = await invoke<boolean>("rewind_check_available");
      setIsAvailable(available);
      if (available) await scanRewindData();
    } catch (e) {
      setIsAvailable(false);
    } finally {
      setIsChecking(false);
    }
  };

  const scanRewindData = async () => {
    setIsScanning(true);
    setError(null);
    try {
      const result = await invoke<RewindScanResult>("rewind_scan");
      setScanResult(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsScanning(false);
    }
  };

  const startMigration = async (freshStart: boolean = false) => {
    setIsMigrating(true);
    setError(null);
    setProgress(null);
    toast({ title: "Starting Import", description: freshStart ? "Starting fresh..." : "Resuming..." });

    try {
      await invoke("rewind_start_migration", { freshStart });
    } catch (e) {
      setError(String(e));
      setIsMigrating(false);
    }
  };

  const cancelMigration = async () => {
    try {
      await invoke("rewind_cancel_migration");
      toast({ title: "Cancelling...", description: "Will stop after current video." });
    } catch (e) {
      console.error("Failed to cancel:", e);
    }
  };

  if (isChecking) {
    return (
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Upload className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-foreground mb-1">Rewind AI Import</h3>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Checking for Rewind data...</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isAvailable) {
    return (
      <Card className="border-border bg-card shadow-sm overflow-hidden opacity-60">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-foreground mb-1">Rewind AI Import</h3>
              <p className="text-muted-foreground text-sm">
                No Rewind data found. Install Rewind AI to import your existing recordings.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start p-6 gap-6">
          <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Upload className="h-8 w-8 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-semibold text-foreground">Rewind AI Import</h3>
              {scanResult && scanResult.already_imported_count > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-foreground text-background rounded-full">
                  partially imported
                </span>
              )}
            </div>

            <p className="text-muted-foreground mb-4">
              Import your Rewind screen recordings into screenpipe. Process can be paused and resumed.
            </p>

            {scanResult && !isMigrating && (
              <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Film className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{scanResult.total_video_files.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">videos</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{scanResult.total_size_formatted}</p>
                    <p className="text-xs text-muted-foreground">total size</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {scanResult.already_imported_count > 0
                        ? `${scanResult.already_imported_count}/${scanResult.total_video_files}`
                        : "0"}
                    </p>
                    <p className="text-xs text-muted-foreground">imported</p>
                  </div>
                </div>
              </div>
            )}

            {isMigrating && progress && (
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {progress.current_video ? `Processing: ${progress.current_video}` : "Starting..."}
                  </span>
                  <span className="font-medium">{progress.percent_complete.toFixed(1)}%</span>
                </div>
                <Progress value={progress.percent_complete} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progress.videos_processed} / {progress.total_videos} videos</span>
                  <span>{progress.frames_imported.toLocaleString()} frames</span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg mb-4">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {isMigrating ? (
                <Button variant="destructive" onClick={cancelMigration} className="gap-2">
                  <X className="h-4 w-4" /> Cancel
                </Button>
              ) : (
                <>
                  <Button onClick={() => startMigration(false)} disabled={isScanning} className="gap-2">
                    {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> :
                      scanResult?.already_imported_count ? <RefreshCw className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                    {scanResult?.already_imported_count ? "Resume Import" : "Start Import"}
                  </Button>
                  {scanResult?.already_imported_count > 0 && (
                    <Button variant="outline" onClick={() => startMigration(true)} disabled={isScanning}>
                      Start Fresh
                    </Button>
                  )}
                  <Button variant="ghost" onClick={scanRewindData} disabled={isScanning} className="gap-2">
                    {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {scanResult?.already_imported_count === scanResult?.total_video_files && scanResult?.total_video_files > 0 && (
          <div className="px-6 pb-6">
            <div className="flex items-center gap-2 p-4 bg-muted border border-border rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <p className="text-sm"><strong>All Rewind data imported!</strong> Your recordings are now searchable.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
