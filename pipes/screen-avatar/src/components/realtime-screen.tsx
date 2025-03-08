'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { pipe, VisionEvent } from '@screenpipe/browser';

interface RealtimeScreenProps {
  withOcr?: boolean;
  className?: string;
  onVisionEvent?: (event: VisionEvent) => void;
  withImages?: boolean;
}

export function RealtimeScreen({ 
  withOcr = false,
  withImages = false,
  className = '',
  onVisionEvent 
}: RealtimeScreenProps) {
  const [visionEvent, setVisionEvent] = useState<VisionEvent | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const streamVision = async () => {
      try {
        setIsStreaming(true);
        for await (const event of pipe.streamVision(withOcr, withImages)) {
          if (event.data) {
            setVisionEvent(event.data);
            onVisionEvent?.(event.data);
            console.log("vision event:", {
              ts: event.data.timestamp,
              hasText: !!event.data.text,
              imgSize: event.data.image?.length
            });
            
          }
        }
      } catch (error) {
        console.error("vision stream failed:", error);
        setIsStreaming(false);
      }
    };

    streamVision();

    return () => {
      setIsStreaming(false);
    };
  }, [withOcr, withImages, onVisionEvent]);

  return (
    <div className={`relative ${className}`}>
      {visionEvent?.image && withImages && (
        <div className="space-y-2">
          <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-gray-200">
            <Image 
              src={`data:image/jpeg;base64,${visionEvent.image}`}
              alt="screen capture"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>
      )}

      <div className="space-y-2 p-4 bg-gray-50 rounded-lg text-xs font-mono">
        {visionEvent && (
          <>
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <span className="text-gray-500">timestamp:</span>
              <span>{new Date(visionEvent.timestamp).toLocaleTimeString()}</span>
              
              <span className="text-gray-500">app:</span>
              <span>{visionEvent.app_name || 'unknown'}</span>
              
              <span className="text-gray-500">window:</span>
              <span>{visionEvent.window_name || 'unknown'}</span>
              
            </div>

            {withOcr && visionEvent.text && (
              <div className="mt-4">
                <span className="text-gray-500">text:</span>
                <p className="mt-1 whitespace-pre-wrap">{visionEvent.text}</p>
              </div>
            )}
          </>
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
