// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";

import { useEffect, useState } from "react";
import { useGT } from "gt-react";
import { localFetch } from "@/lib/api";
import { PRIVACY_STATUS_POLL_INTERVAL_MS } from "@/lib/privacy-processing";

export type PrivacyQueueStatus = {
  enabled: boolean;
  scope: "protected_capture_surfaces";
  surfaces: {
    kind: string;
    discovering: boolean;
    pending: number;
    pending_capped: boolean;
    deferred: number;
  }[];
};

function validStatus(value: unknown): value is PrivacyQueueStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as PrivacyQueueStatus;
  return typeof status.enabled === "boolean" && status.scope === "protected_capture_surfaces" &&
    Array.isArray(status.surfaces) && (!status.enabled || status.surfaces.length > 0) && status.surfaces.every((surface) =>
      typeof surface.kind === "string" && typeof surface.discovering === "boolean" &&
      Number.isSafeInteger(surface.pending) && surface.pending >= 0 &&
      Number.isSafeInteger(surface.deferred) && surface.deferred >= 0 &&
      typeof surface.pending_capped === "boolean");
}

export function PrivacyStatusView({ status, unavailable }: {
  status: PrivacyQueueStatus | null;
  unavailable: boolean;
}) {
  const ui = useGT();
  const discovering = status?.surfaces.some((s) => s.discovering);
  const pending = status?.surfaces.reduce((sum, s) => sum + s.pending, 0) ?? 0;
  const textEnabled = status?.surfaces.some((s) => s.kind !== "image");
  const imageEnabled = status?.surfaces.some((s) => s.kind === "image");
  const retrying = status?.surfaces.some((s) => s.deferred > 0);
  const title = unavailable ? ui("Processing status unavailable")
    : !status ? ui("Checking privacy processing")
    : !status.enabled ? ui("Waiting for protection to start")
    : discovering ? ui("Checking existing history")
    : retrying ? ui("Privacy processing will retry")
    : pending > 0 ? ui("Privacy processing") : ui("Enabled privacy checks complete");

  return <div className="mt-3 border-t border-border pt-3 text-xs" data-testid="privacy-processing-status">
    <p role="status" className="font-medium text-foreground">{title}</p>
    <p className="mt-1 text-muted-foreground">
      {unavailable ? ui("The status check failed. It will retry automatically; processing state is unknown.")
        : status && !status.enabled ? ui("Protection is not active in the recording engine yet. Check your recording settings if this persists.")
        : ui("Recording continues. New data becomes available after its privacy checks finish.")}
    </p>
    {status?.enabled && !unavailable && <details className="mt-2 text-muted-foreground">
      <summary className="cursor-pointer w-fit">{ui("Processing details")}</summary>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 max-w-sm">
        <dt>{ui("Text records waiting")}</dt>
        <dd>{!textEnabled ? ui("Not enabled") : <>{status.surfaces.filter((s) => s.kind !== "image").reduce((sum, s) => sum + s.pending, 0).toLocaleString()}{status.surfaces.some((s) => s.kind !== "image" && (s.pending_capped || s.discovering)) ? "+" : ""}</>}</dd>
        <dt>{ui("Screenshots waiting")}</dt>
        <dd>{!imageEnabled ? ui("Not enabled") : <>{status.surfaces.find((s) => s.kind === "image")?.pending.toLocaleString() ?? "0"}{status.surfaces.some((s) => s.kind === "image" && (s.pending_capped || s.discovering)) ? "+" : ""}</>}</dd>
      </dl>
      {discovering && <p className="mt-2">{ui("Counts may increase while existing history is checked.")}</p>}
      <p className="mt-2">{ui("Text and screenshots finish separately. This status covers privacy processing, not upload completion.")}</p>
      <p className="mt-1">{ui("Some live and derived-data features are unavailable with protection enabled.")}</p>
    </details>}
  </div>;
}

/** Poll only while the settings card is mounted and visible. Keep requests
 * sequential and bounded; a slow or unavailable engine cannot stack polls. */
export function PrivacyProcessingStatus() {
  const [status, setStatus] = useState<PrivacyQueueStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState !== "hidden") {
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 5000);
        try {
          const response = await localFetch("/privacy/status", { signal: controller.signal });
          if (!response.ok) throw new Error("status unavailable");
          const value: unknown = await response.json();
          if (!validStatus(value)) throw new Error("invalid status");
          if (!stopped) { setStatus(value); setUnavailable(false); }
        } catch {
          if (!stopped) { setStatus(null); setUnavailable(true); }
        } finally { clearTimeout(timeout); }
      }
      if (!stopped) timer = setTimeout(poll, PRIVACY_STATUS_POLL_INTERVAL_MS);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
  }, []);
  return <PrivacyStatusView status={status} unavailable={unavailable} />;
}
