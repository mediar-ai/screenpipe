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
      const result = await pipe.queryScreenpipe({
        contentType: "ocr",
        limit: 1,
      });
      
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
      setError("Failed to fetch OCR data");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button 
        onClick={fetchLatestOCR} 
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Fetching...
          </>
        ) : (
          'Fetch Latest OCR'
        )}
      </Button>
      
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      
      {ocrData && (
        <pre className="p-4 bg-slate-100 rounded-lg overflow-auto max-h-[400px]">
          {JSON.stringify(ocrData, null, 2)}
        </pre>
      )}
    </div>
  );
}
