"use client";

import { useEffect, useState } from "react";
import { pipe } from "@screenpipe/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UiContent } from "@screenpipe/browser";
import { Skeleton } from "@/components/ui/skeleton";

export function LastUiRecord() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uiRecord, setUiRecord] = useState<UiContent | null>(null);

  async function fetchLatestUiRecord() {
    try {
      console.log("fetching latest ui record...");
      setLoading(true);
      setError(null);
      
      const response = await pipe.queryScreenpipe({
        contentType: "ui",
        limit: 1,
        // Sort by most recent
        offset: 0,
      });
      
      console.log("ui record response:", response);
      
      if (response && response.data.length > 0 && response.data[0].type === "UI") {
        setUiRecord(response.data[0].content);
      } else {
        console.log("no ui records found");
        setError("No UI records found");
      }
    } catch (err) {
      console.error("error fetching ui record:", err);
      setError(`Failed to fetch UI record: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full">
      <CardContent>
        <div className="mt-4 mb-4">
          <button 
            onClick={fetchLatestUiRecord}
            className="w-full py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            disabled={loading}
          >
            {loading ? "fetching..." : "fetch latest ui record"}
          </button>
        </div>
        
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : uiRecord ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1">
              <span className="text-muted-foreground">app:</span>
              <span className="col-span-2 font-mono text-sm">{uiRecord.appName}</span>
              
              <span className="text-muted-foreground">window:</span>
              <span className="col-span-2 font-mono text-sm">{uiRecord.windowName}</span>
              
              <span className="text-muted-foreground">time:</span>
              <span className="col-span-2 font-mono text-sm">
                {new Date(uiRecord.timestamp).toLocaleTimeString()}
              </span>
            </div>
            
            <div className="mt-2">
              <span className="text-muted-foreground">text:</span>
              <div className="mt-1 p-2 bg-muted rounded-md font-mono text-xs overflow-auto max-h-24 whitespace-pre-wrap">
                {uiRecord.text}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground">press the button to fetch ui records</div>
        )}
      </CardContent>
    </Card>
  );
} 