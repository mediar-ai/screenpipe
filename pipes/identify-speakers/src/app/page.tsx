"use client";

import IdentifySpeakers from "@/components/identify-speakers";
import { useState } from "react";

export default function IdentifySpeakersPage() {
  // @ts-ignore
  const [_, setShowIdentifySpeakers] = useState(true);
  return (
    <IdentifySpeakers
      showIdentifySpeakers={true}
      setShowIdentifySpeakers={setShowIdentifySpeakers}
    />
  );
}
