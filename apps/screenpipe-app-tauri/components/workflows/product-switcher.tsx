// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";

import { Check, ChevronDown, Workflow, History } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
    <DropdownMenu>
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={ui("Switch workspace")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 font-semibold text-inherit transition-colors hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)] data-[state=open]:bg-[color-mix(in_srgb,currentColor_8%,transparent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-current",
                  compact ? "text-sm" : "text-base",
                )}
              >
                <span>{mode === "workflows" ? ui("Workflows") : ui("Memory")}</span>
                <ChevronDown size={14} className="shrink-0 opacity-70" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            {ui("Switch between Memory and Workflows")}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="start" sideOffset={6} className="w-64 p-1" aria-label={ui("Workspaces")}>
        {([
          ["screenpipe", History, ui("Memory"), ui("Find anything from your day")],
          ["workflows", Workflow, ui("Workflows"), ui("Understand how your work gets done")],
        ] as const).map(([value, Icon, title, subtitle]) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => { if (mode !== value) onChange(value); }}
            className="cursor-pointer gap-3 px-3 py-2.5"
            role="menuitemradio"
            aria-checked={mode === value}
          >
            <Icon size={16} className="shrink-0" aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-sm font-medium">{title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span>
            </span>
            {mode === value && <Check size={14} aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
