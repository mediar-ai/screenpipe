// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

"use client";

import { useRef, useState } from "react";
import { Video, X } from "lucide-react";
import { useGT } from "gt-react";
import type { NotificationAction } from "@/lib/notifications/actions";
import { meetingJoinChoices, meetingProvider } from "@/lib/notifications/meeting-join";

const MEETING_JOIN_CARD_WIDTH = 460;
const MEETING_JOIN_CARD_HEIGHT = 124;

interface Props {
  title: string;
  body: string;
  actions: NotificationAction[];
  scale?: number;
  onAction: (action: NotificationAction) => Promise<void>;
  onDismiss: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/** Shared Windows/Linux join card; mirrors the native macOS split control. */
export function MeetingJoinNotification(props: Props) {
  const ui = useGT();
  const scale = props.scale ?? 1;
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
  const joinButtonStyle = {
    ...buttonStyle,
    minWidth: 0,
    flex: choices.hd ? "1 1 0" : "0 1 auto",
  };
  const hdButtonStyle = { ...buttonStyle, flex: "0 0 auto" };
  return (
    <div style={{ width: MEETING_JOIN_CARD_WIDTH, height: MEETING_JOIN_CARD_HEIGHT,
      transform: `scale(${scale})`, transformOrigin: "top left" }}>
    <section aria-label={ui("Meeting starting")} aria-busy={pending}
      onMouseEnter={props.onMouseEnter} onMouseLeave={props.onMouseLeave}
      style={{ boxSizing: "border-box", width: MEETING_JOIN_CARD_WIDTH, height: MEETING_JOIN_CARD_HEIGHT,
        background: "#000", color: "#f2f2f2", border: "1px solid #6b6b6b", borderRadius: 8,
        padding: 14, display: "flex", flexDirection: "column", gap: 8,
        fontFamily: '"IBM Plex Mono", monospace' }}>
      <style>{`
        .meeting-join-action, .meeting-join-dismiss { transition: background-color 150ms ease, color 150ms ease; }
        .meeting-join-action:hover:not(:disabled) { background: #d9d9d9 !important; }
        .meeting-join-action:active:not(:disabled) { background: #c9c9c9 !important; }
        .meeting-join-action:disabled { opacity: .58; cursor: wait; }
        .meeting-join-action:focus-visible { outline: 2px solid #111; outline-offset: -3px; border-radius: 5px; }
        .meeting-join-dismiss:hover { color: #f2f2f2 !important; background: #ffffff1a !important; }
        .meeting-join-dismiss:focus-visible { outline: 2px solid #f2f2f2; outline-offset: -2px; border-radius: 5px; }
        @media (prefers-reduced-motion: reduce) { .meeting-join-action, .meeting-join-dismiss { transition: none; } }
      `}</style>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <Video size={20} fill="currentColor" aria-hidden="true" style={{ color: "#bfbfbf", marginTop: 3, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{props.title}</div>
          <div style={{ color: "#999", fontSize: 12, lineHeight: "14px", marginTop: 4,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{props.body}</div>
        </div>
        <button type="button" aria-label={ui("Dismiss notification")} onClick={props.onDismiss}
          className="meeting-join-dismiss"
          style={{ background: "transparent", border: 0, color: "#999", padding: 4, cursor: "pointer", borderRadius: 5 }}><X size={16} /></button>
      </div>
      <div className="meeting-join-controls" style={{ alignSelf: "flex-end", marginTop: "auto", display: "flex", alignItems: "center", borderRadius: 6, background: "#ebebeb", maxWidth: "100%", minWidth: 0 }}>
        <button type="button" className="meeting-join-action" disabled={pending} onClick={() => void join(choices.join)} style={joinButtonStyle}>
          {provider ? <img src={`/images/meeting-providers/${provider}.png`} width={18} height={18} alt="" /> : <Video size={18} fill="currentColor" aria-hidden="true" />}
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{choices.join.label || ui("join and take notes")}</span>
        </button>
        {choices.hd && <>
          <span aria-hidden="true" style={{ width: 1, height: 20, flexShrink: 0, background: "#00000026" }} />
          <button type="button" className="meeting-join-action" disabled={pending} onClick={() => void join(choices.hd!)} style={hdButtonStyle}
            aria-label={ui("Join and take notes with HD screen recording")}
            title={ui("Join and take notes with HD screen recording: more frequent screenshots for smoother replay. Uses more storage.")}>
            {ui("join + HD")}
          </button>
        </>}
      </div>
    </section>
    </div>
  );
}
