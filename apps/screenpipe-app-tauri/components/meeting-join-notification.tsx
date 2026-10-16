// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

"use client";

import { useRef, useState } from "react";
import { Video, X } from "lucide-react";
import { useGT } from "gt-react";
import type { NotificationAction } from "@/lib/notifications/actions";
import { meetingJoinChoices, meetingProvider } from "@/lib/notifications/meeting-join";

interface Props {
  title: string;
  body: string;
  actions: NotificationAction[];
  onAction: (action: NotificationAction) => Promise<void>;
  onDismiss: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/** Shared Windows/Linux join card; mirrors the native macOS split control. */
export function MeetingJoinNotification(props: Props) {
  const ui = useGT();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const choices = meetingJoinChoices(props.actions);
  if (!choices) return null;
  const provider = meetingProvider(choices.join.url!);
  const join = async (action: NotificationAction) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try { await props.onAction(action); }
    finally { busy.current = false; setPending(false); }
  };
  const buttonStyle = {
    height: 36, padding: "0 12px", border: 0, background: "transparent",
    color: "#000", font: "inherit", fontSize: 13, fontWeight: 500,
    cursor: pending ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 7,
    whiteSpace: "nowrap" as const,
  };
  return (
    <section aria-label={ui("Meeting starting")} aria-busy={pending}
      onMouseEnter={props.onMouseEnter} onMouseLeave={props.onMouseLeave}
      style={{ boxSizing: "border-box", width: "100%", height: "100%", minHeight: 124,
        background: "#000", color: "#f2f2f2", border: "1px solid #6b6b6b", borderRadius: 8,
        padding: 14, display: "flex", flexDirection: "column", gap: 8,
        fontFamily: '"IBM Plex Mono", monospace' }}>
      <style>{`.meeting-join-controls button:focus-visible { outline: 2px solid #4285f4; outline-offset: -3px; border-radius: 5px; }`}</style>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <Video size={20} fill="currentColor" aria-hidden="true" style={{ color: "#bfbfbf", marginTop: 3, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{props.title}</div>
          <div style={{ color: "#999", fontSize: 12, lineHeight: "14px", marginTop: 4,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{props.body}</div>
        </div>
        <button type="button" aria-label={ui("Dismiss notification")} onClick={props.onDismiss}
          style={{ background: "transparent", border: 0, color: "#999", padding: 4, cursor: "pointer" }}><X size={16} /></button>
      </div>
      <div className="meeting-join-controls" style={{ alignSelf: "flex-end", marginTop: "auto", display: "flex", alignItems: "center", borderRadius: 6, background: "#ebebeb", maxWidth: "100%" }}>
        <button type="button" disabled={pending} onClick={() => void join(choices.join)} style={buttonStyle}>
          {provider ? <img src={`/images/meeting-providers/${provider}.png`} width={18} height={18} alt="" /> : <Video size={18} fill="currentColor" aria-hidden="true" />}
          {choices.join.label || ui("join and take notes")}
        </button>
        {choices.hd && <>
          <span aria-hidden="true" style={{ width: 1, height: 20, flexShrink: 0, background: "#00000026" }} />
          <button type="button" disabled={pending} onClick={() => void join(choices.hd!)} style={buttonStyle}
            aria-label={ui("Join and take notes with HD screen recording")}
            title={ui("Join and take notes with HD screen recording: more frequent screenshots for smoother replay. Uses more storage.")}>
            {ui("join + HD")}
          </button>
        </>}
      </div>
    </section>
  );
}
