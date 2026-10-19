// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";

import { MessageSquare, Workflow } from "lucide-react";
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
      className={cn("flex rounded-md border border-border bg-muted/50 p-1", compact ? "w-fit" : "w-full")}
    >
      {([
        ["screenpipe", MessageSquare, ui("Chat")],
        ["workflows", Workflow, ui("Workflows")],
      ] as const).map(([value, Icon, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => { if (mode !== value) onChange(value); }}
          className={cn(
            "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
            mode === value
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
          )}
        >
          <Icon size={15} className="shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
