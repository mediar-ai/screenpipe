"use client";

import { useState } from "react";
import { pipe, type AudioContent, type ContentItem } from "@screenpipe/browser";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function LastAudioTranscription({ onDataChange }: { onDataChange?: (data: any, error: string | null) => void }) {
  const [audioData, setAudioData] = useState<AudioContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLatestAudio = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log("fetching latest audio transcription...");
      
      // Add error handling for the analytics connection issue
      const originalConsoleError = console.error;
      console.error = function(msg, ...args) {
        // Filter out the analytics connection errors
        if (typeof msg === 'string' && 
           (msg.includes('failed to fetch settings') || 
            msg.includes('ERR_CONNECTION_REFUSED'))) {
          // Suppress these specific errors
          return;
        }
        originalConsoleError.apply(console, [msg, ...args]);
      };
      
      const startTime = performance.now();
      const result = await pipe.queryScreenpipe({
        contentType: "audio",
        limit: 1,
      });
      const requestTime = performance.now() - startTime;
      
      // Restore original console.error
      console.error = originalConsoleError;
      
      // Pass the raw response to the parent component for display in the raw output tab
      if (onDataChange) {
        onDataChange(result, null);
      }
      
      if (!result || !result.data || result.data.length === 0) {
        console.log("no audio data found");
        const errorMsg = "No audio transcription data available";
        setError(errorMsg);
        if (onDataChange) {
          onDataChange(null, errorMsg);
        }
        return;
      }
      
      const item = result.data[0] as ContentItem & { type: "Audio" };
      console.log("got audio data:", item.content);
      setAudioData(item.content);
    } catch (error) {
      console.error("error fetching audio:", error);
      const errorMessage = error instanceof Error 
        ? `Failed to fetch audio data: ${error.message}`
        : "Failed to fetch audio data";
      setError(errorMessage);
      
      // Pass the error to the parent component
      if (onDataChange) {
        onDataChange(null, errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderAudioContent = (audioData: AudioContent) => {
    return (
      <div className="space-y-2 text-xs">
        <div className="flex flex-col text-slate-600">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-semibold">deviceName: </span>
              <span>{audioData.deviceName || "Unknown"}</span>
            </div>
            <div>
              <span className="font-semibold">timestamp: </span>
              <span>{new Date(audioData.timestamp).toLocaleString()}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-semibold">deviceType: </span>
              <span>{audioData.deviceType || "Unknown"}</span>
            </div>
            <div>
              <span className="font-semibold">speaker: </span>
              <span>{audioData.speaker?.name || `ID: ${audioData.speaker?.id || "Unknown"}`}</span>
            </div>
          </div>
        </div>
        <div className="bg-slate-100 rounded p-2 overflow-auto h-[230px] whitespace-pre-wrap font-mono text-xs">
          {audioData.transcription}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <Button 
          onClick={fetchLatestAudio} 
          disabled={isLoading}
          size="sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Loading...
            </>
          ) : (
            'Fetch Audio'
          )}
        </Button>
        
        {audioData && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigator.clipboard.writeText(audioData.transcription)}
          >
            Copy
          </Button>
        )}
      </div>
      
      {error && <p className="text-xs text-red-500">{error}</p>}
      {audioData && renderAudioContent(audioData)}
    </div>
  );
} 