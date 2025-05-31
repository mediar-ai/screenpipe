"use client";

import { useState } from "react";
import { pipe, type OCRContent, type ContentItem } from "@screenpipe/browser";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function LastOcrImage({ onDataChange }: { onDataChange?: (data: any, error: string | null) => void }) {
  const [ocrData, setOcrData] = useState<OCRContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLatestOCR = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log("fetching latest ocr...");
      
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
        contentType: "ocr",
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
        console.log("no ocr data found");
        const errorMsg = "No OCR data available";
        setError(errorMsg);
        if (onDataChange) {
          onDataChange(null, errorMsg);
        }
        return;
      }
      
      const item = result.data[0] as ContentItem & { type: "OCR" };
      console.log("got ocr data:", item.content);
      setOcrData(item.content);
    } catch (error) {
      console.error("error fetching ocr:", error);
      const errorMessage = error instanceof Error 
        ? `Failed to fetch OCR data: ${error.message}`
        : "Failed to fetch OCR data";
      setError(errorMessage);
      
      // Pass the error to the parent component
      if (onDataChange) {
        onDataChange(null, errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderOcrContent = (ocrData: OCRContent) => {
    return (
      <div className="space-y-2 text-xs">
        <div className="flex flex-col text-slate-600">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-semibold">appName: </span>
              <span>{ocrData.appName || "Unknown"}</span>
            </div>
            <div>
              <span className="font-semibold">timestamp: </span>
              <span>{new Date(ocrData.timestamp).toLocaleString()}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-semibold">windowName: </span>
              <span>{ocrData.windowName || "Unknown"}</span>
            </div>
            <div>
              <span className="font-semibold">type: </span>
              <span>Window</span>
            </div>
          </div>
        </div>
        <div className="bg-slate-100 rounded p-2 overflow-auto h-[230px] whitespace-pre-wrap font-mono text-xs">
          {ocrData.text}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <Button 
          onClick={fetchLatestOCR} 
          disabled={isLoading}
          size="sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Loading...
            </>
          ) : (
            'Fetch OCR'
          )}
        </Button>
      </div>
      
      {error && <p className="text-xs text-red-500">{error}</p>}
      {ocrData && renderOcrContent(ocrData)}
    </div>
  );
}
