// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";

import { useWorkflowsRolloutEnabled } from "@/lib/workflows/rollout";
import { cn } from "@/lib/utils";
import { useGT } from "gt-react";

export type ProductMode = "screenpipe" | "workflows";
export function ProductSwitcher({ mode, onChange, compact = false }: {
  mode: ProductMode;
  onChange: (mode: ProductMode) => void;
  compact?: boolean;
}) {

  const ui = useGT();
  const enabled = useWorkflowsRolloutEnabled();
  if (!enabled) return null;
  return (
    <div
      role="group"
      aria-label={ui("Switch workspace")}
      className={cn("flex gap-5 border-b border-[color-mix(in_srgb,currentColor_12%,transparent)] text-inherit", compact ? "w-fit" : "w-full")}
    >
      {([
        ["screenpipe", ui("Memory")],
        ["workflows", ui("Workflows")],
      ] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => { if (mode !== value) onChange(value); }}
          className={cn(
            "relative -mb-px min-w-0 whitespace-nowrap border-b-2 px-1 pb-2.5 pt-1.5 text-[13px] font-medium text-inherit transition-opacity focus-visible:rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-current",
            mode === value
              ? "border-current opacity-100"
              : "border-transparent opacity-60 hover:opacity-100",
          )}
        >
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
