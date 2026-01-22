"use client";

import { EduPipeSettingsProvider } from "@/lib/edupipe/use-edupipe-settings";
import { EduPipeMain } from "@/components/edupipe/edupipe-main";

export default function EduPipePage() {
  return (
    <EduPipeSettingsProvider>
      <EduPipeMain />
    </EduPipeSettingsProvider>
  );
}
