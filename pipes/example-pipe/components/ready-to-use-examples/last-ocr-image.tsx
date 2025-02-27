"use client";

import { useState } from "react";
import { pipe, type OCRContent, type ContentItem } from "@screenpipe/browser";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function LastOcrImage() {
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
      
      const result = await pipe.queryScreenpipe({
        contentType: "ocr",
        limit: 1,
      });
      
      // Restore original console.error
      console.error = originalConsoleError;
      
      if (!result || !result.data || result.data.length === 0) {
        console.log("no ocr data found");
        setError("No OCR data available");
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
    } finally {
      setIsLoading(false);
    }
  };

  const renderOcrContent = (ocrData: OCRContent) => {
    return (
      <div className="space-y-2 text-xs">
        <div className="flex flex-col text-slate-600">
          <div className="flex justify-between">
            <span>{ocrData.appName || "Unknown"}</span>
            <span>{new Date(ocrData.timestamp).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>{ocrData.windowName || "Unknown"}</span>
            <span>Window</span>
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
        
        {ocrData && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigator.clipboard.writeText(ocrData.text)}
          >
            Copy
          </Button>
        )}
      </div>
      
      {error && <p className="text-xs text-red-500">{error}</p>}
      {ocrData && renderOcrContent(ocrData)}
    </div>
  );
}
