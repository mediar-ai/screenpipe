// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import { useLayoutEffect, useRef, useState } from "react";
import type { MeetingOverlayTranscriptItem } from "./use-meeting-overlay";

/** Mounted only while the card is open, so reopening resumes at the latest text. */
export function TranscriptHistory({ items, scale }: {
  items: MeetingOverlayTranscriptItem[];
  scale: number;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  // Preserve the words as well as their pixel position when partial speech
  // reflows or older entries fall out of the bounded live feed.
  const [pausedItems, setPausedItems] = useState<MeetingOverlayTranscriptItem[] | null>(null);

  useLayoutEffect(() => {
    const el = viewport.current;
    if (el && pausedItems === null) el.scrollTop = el.scrollHeight;
  }, [items, pausedItems, scale]);

  return (
    <div
      ref={viewport}
      role="region"
      tabIndex={0}
      aria-label="Live transcript"
      className="min-h-0 overflow-y-auto font-mono text-white/80"
      style={{ padding: `${8 * scale}px ${10 * scale}px`, fontSize: `${8 * scale}px`, overflowAnchor: "none" }}
      onScroll={(event) => {
        const el = event.currentTarget;
        const atBottom = el.scrollHeight - el.clientHeight - el.scrollTop <= 0.5;
        setPausedItems((previous) => atBottom ? null : previous ?? items);
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {(pausedItems ?? items).map((item) => (
        <div key={`${item.deviceName}:${item.deviceType}:${item.itemId}`} className="flex items-baseline" style={{ gap: 7 * scale, marginBottom: 7 * scale }}>
          <span className="shrink-0 text-white/40 truncate text-right" style={{ width: 48 * scale }}>
            {item.speakerName || (item.deviceType === "input" ? "me" : "speaker")}
          </span>
          <span className="min-w-0 whitespace-pre-wrap break-words" style={{ opacity: item.isFinal ? 1 : 0.7 }}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
