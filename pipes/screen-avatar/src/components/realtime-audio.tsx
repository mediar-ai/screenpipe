'use client';

import { useEffect, useState, useRef } from 'react';
import { pipe, TranscriptionChunk } from '@screenpipe/browser';

interface RealtimeAudioProps {
  className?: string;
  onTranscription?: (transcription: TranscriptionChunk) => void;
  onHistoryUpdate?: (history: string) => void;
  enabled?: boolean;
}

export function RealtimeAudio({ 
  className = '',
  onTranscription,
  onHistoryUpdate,
  enabled = false
}: RealtimeAudioProps) {
//   console.log("realtime-audio component:", { 
//     enabled,
//     mounted: true,
//     hasOnTranscription: !!onTranscription 
//   });
  
  const [transcription, setTranscription] = useState<TranscriptionChunk | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamRef = useRef<any>(null);
  const [history, setHistory] = useState('');
  const historyRef = useRef(history);

  // Update ref when history changes
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    console.log("realtime-audio effect triggered:", { enabled });
    
    if (!enabled) {
      console.log("audio stream disabled, stopping...")
      if (streamRef.current) {
        streamRef.current.return?.();
        setIsStreaming(false);
      }
      return;
    }

    const streamAudio = async () => {
      try {
        setIsStreaming(true);
        console.log("starting audio stream...")
        
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
            onTranscription?.(chunk);
            onHistoryUpdate?.(newHistory);
            // console.log("transcription:", {
            //   text: chunk.transcription,
            //   device: chunk.device,
            //   isFinal: chunk.is_final
            // });
          }
        }
      } catch (error) {
        console.error("audio stream failed:", error);
      } finally {
        setIsStreaming(false);
        console.log("audio stream stopped");
      }
    };

    streamAudio();

    return () => {
      console.log("cleaning up audio stream...");
      if (streamRef.current) {
        streamRef.current.return?.();
      }
      setIsStreaming(false);
    };
  }, [enabled, onTranscription]);

  return (
    <div className={`relative ${className}`}>
      <div className="space-y-2 p-4 bg-gray-50 rounded-lg text-xs font-mono">
        {transcription && (
          <div className="grid grid-cols-[100px_1fr] gap-2">
            <span className="text-gray-500">timestamp:</span>
            <span>{new Date(transcription.timestamp).toLocaleTimeString()}</span>
            
            <span className="text-gray-500">device:</span>
            <span>{transcription.device}</span>
            
            <span className="text-gray-500">type:</span>
            <span>{transcription.is_input ? 'input' : 'output'}</span>
            
            <span className="text-gray-500">text:</span>
            <span className="whitespace-pre-wrap">{transcription.transcription}</span>
          </div>
        )}

        {history && (
          <div className="mt-4 border-t pt-4">
            <div className="text-gray-500 mb-2">history:</div>
            <div className="max-h-40 overflow-y-auto">
              <div className="whitespace-pre-wrap">{history}</div>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-green-500' : 'bg-gray-400'}`} />
        <span className="text-xs text-gray-500 font-mono">
          {isStreaming ? 'streaming' : 'connecting'}
        </span>
      </div>
    </div>
  );
} 