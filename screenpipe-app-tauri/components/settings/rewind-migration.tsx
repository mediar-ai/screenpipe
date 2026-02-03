"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Upload, CheckCircle2, AlertCircle, Info } from "lucide-react";

interface RewindScanResult {
  total_video_files: number;
  total_size_bytes: number;
  estimated_frame_count: number;
  already_imported_count: number;
  rewind_path: string;
}

export function RewindMigration() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [scanResult, setScanResult] = useState<RewindScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationSessionId, setMigrationSessionId] = useState<string | null>(null);

  // Check if Rewind data is available on mount
  useEffect(() => {
    checkRewindAvailable();
  }, []);

  const checkRewindAvailable = async () => {
    try {
      const available = await invoke<boolean>("check_rewind_available");
      setIsAvailable(available);
      if (available) {
        await scanRewindData();
      }
    } catch (e) {
      console.error("Failed to check Rewind availability:", e);
      setIsAvailable(false);
    }
  };

  const scanRewindData = async () => {
    setIsScanning(true);
    setError(null);
    try {
      const result = await invoke<RewindScanResult>("scan_rewind_data");
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
    try {
      const sessionId = await invoke<string>("start_rewind_migration", {
        freshStart,
      });
      setMigrationSessionId(sessionId);
    } catch (e) {
      setError(String(e));
      setIsMigrating(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (isAvailable === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Rewind AI Migration
          </CardTitle>
          <CardDescription>
            Import your screen recordings from Rewind AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">
              Checking for Rewind data...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Rewind AI Migration
          </CardTitle>
          <CardDescription>
            Import your screen recordings from Rewind AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No Rewind AI data found. This feature allows you to import your
              existing Rewind recordings into screenpipe if you have Rewind
              installed.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Rewind AI Migration
          <Badge variant="secondary">Beta</Badge>
        </CardTitle>
        <CardDescription>
          Import your screen recordings from Rewind AI into screenpipe
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isScanning ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">
              Scanning Rewind data...
            </span>
          </div>
        ) : scanResult ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Video files:</span>
                <span className="ml-2 font-medium">
                  {scanResult.total_video_files.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Total size:</span>
                <span className="ml-2 font-medium">
                  {formatBytes(scanResult.total_size_bytes)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Estimated frames:</span>
                <span className="ml-2 font-medium">
                  {scanResult.estimated_frame_count.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Already imported:</span>
                <span className="ml-2 font-medium">
                  {scanResult.already_imported_count.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Source: {scanResult.rewind_path}
            </div>

            {scanResult.already_imported_count > 0 && (
              <Progress
                value={
                  (scanResult.already_imported_count /
                    scanResult.total_video_files) *
                  100
                }
                className="h-2"
              />
            )}

            {isMigrating ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">
                  Migration in progress... This may take a while.
                </span>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={() => startMigration(false)}
                  disabled={isMigrating}
                >
                  {scanResult.already_imported_count > 0
                    ? "Resume Migration"
                    : "Start Migration"}
                </Button>
                {scanResult.already_imported_count > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => startMigration(true)}
                    disabled={isMigrating}
                  >
                    Start Fresh
                  </Button>
                )}
                <Button variant="ghost" onClick={scanRewindData}>
                  Refresh
                </Button>
              </div>
            )}

            {migrationSessionId && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Migration started! Session ID: {migrationSessionId}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <Button onClick={scanRewindData} disabled={isScanning}>
            Scan Rewind Data
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
