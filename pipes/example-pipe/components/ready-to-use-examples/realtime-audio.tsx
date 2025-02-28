"use client";

import { useEffect, useState, useRef } from "react";
import { pipe, type TranscriptionChunk } from "@screenpipe/browser";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useSettings } from "@/lib/settings-provider";

export function RealtimeAudio({ onDataChange }: { onDataChange?: (data: any, error: string | null) => void }) {
  const { settings } = useSettings();
  const [transcription, setTranscription] = useState<TranscriptionChunk | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState('');
  const historyRef = useRef(history);
  const streamRef = useRef<any>(null);

  // Update ref when history changes
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const startStreaming = async () => {
    try {
      // Check if realtime transcription is enabled
      if (!settings?.screenpipeAppSettings?.enableRealtimeAudioTranscription) {
        const errorMessage = "realtime audio transcription is not enabled in settings, go to account-> settings -> recording -> enable realtime audiotranscription -> models to use: screenpipe cloud. Then Refresh. If it doesn't start you might need to restart.";
        setError(errorMessage);
        
        // Pass the error to the parent component
        if (onDataChange) {
          onDataChange(null, errorMessage);
        }
        
        return; // Exit early
      }
      
      setError(null);
      setIsStreaming(true);
      
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
      
      const stream = pipe.streamTranscriptions();
      streamRef.current = stream;

      for await (const event of stream) {
        if (event.choices?.[0]?.text) {
          const chunk: TranscriptionChunk = {
            transcription: event.choices[0].text,
            timestamp: event.metadata?.timestamp || new Date().toISOString(),
            device: event.metadata?.device || 'unknown',
            is_input: event.metadata?.isInput || false,
            is_final: event.choices[0].finish_reason !== null
          };
          
          setTranscription(chunk);
          const newHistory = historyRef.current + ' ' + chunk.transcription;
          setHistory(newHistory);
          
          // Pass the raw data to the parent component for display in the raw output tab
          if (onDataChange) {
            onDataChange(chunk, null);
          }
          
          console.log("transcription:", {
            text: chunk.transcription,
            device: chunk.device,
            isFinal: chunk.is_final
          });
        }
      }
      
      // Restore original console.error
      console.error = originalConsoleError;
      
    } catch (error) {
      console.error("audio stream failed:", error);
      const errorMessage = error instanceof Error 
        ? `Failed to stream audio: ${error.message}`
        : "Failed to stream audio";
      setError(errorMessage);
      
      // Pass the error to the parent component
      if (onDataChange) {
        onDataChange(null, errorMessage);
      }
      
      setIsStreaming(false);
    }
  };

  const stopStreaming = () => {
    if (streamRef.current) {
      streamRef.current.return?.();
    }
    setIsStreaming(false);
  };

  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, []);

  const renderTranscriptionContent = (transcription: TranscriptionChunk) => {
    return (
      <div className="space-y-2 text-xs">
        <div className="flex flex-col text-slate-600">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-semibold">timestamp: </span>
              <span>{new Date(transcription.timestamp).toLocaleString()}</span>
            </div>
            <div>
              <span className="font-semibold">device: </span>
              <span>{transcription.device}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-semibold">type: </span>
              <span>{transcription.is_input ? 'Input' : 'Output'}</span>
            </div>
            <div>
              <span className="font-semibold">final: </span>
              <span>{transcription.is_final ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>
        
        <div className="bg-slate-100 rounded p-2 overflow-auto max-h-[100px] whitespace-pre-wrap font-mono text-xs">
          {transcription.transcription}
        </div>
        
        {history && (
          <div className="mt-2">
            <div className="text-slate-600 font-semibold mb-1">History:</div>
            <div className="bg-slate-100 rounded p-2 overflow-auto h-[130px] whitespace-pre-wrap font-mono text-xs">
              {history}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <Button 
          onClick={isStreaming ? stopStreaming : startStreaming} 
          size="sm"
        >
          {isStreaming ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Stop Streaming
            </>
          ) : (
            'Start Audio Transcritpion Stream'
          )}
        </Button>
        
        {history && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(history);
              setHistory('');
            }}
          >
            Clear History
          </Button>
        )}
      </div>
      
      {error && <p className="text-xs text-red-500">{error}</p>}
      {transcription && renderTranscriptionContent(transcription)}
      
      <div className="flex items-center gap-1.5 text-right justify-end">
        <div className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-green-500' : 'bg-gray-400'}`} />
        <span className="text-xs text-gray-500 font-mono">
          {isStreaming ? 'streaming' : 'stopped'}
        </span>
      </div>
    </div>
  );
} 