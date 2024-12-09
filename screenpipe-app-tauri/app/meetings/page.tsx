"use client";

import MeetingHistory from "@/components/meeting-history";
import { useState } from "react";

export default function MeetingsPage() {
  const [showMeetingHistory, setShowMeetingHistory] = useState(true);
  return (
    <MeetingHistory
      showMeetingHistory={true}
      setShowMeetingHistory={setShowMeetingHistory}
    />
  );
}
