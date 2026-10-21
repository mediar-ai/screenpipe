// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
/** Portable projection of the Studio flowchart input. No routing is inferred from prose. */
export type MapStage = {
  key: string; stepId?: string; sourceStepNumber?: number; title: string;
  kind: "trigger" | "action" | "decision" | "check" | "end";
  app?: string; nextStepId?: string; avgSeconds?: number | null;
  decision?: { condition: string; if_yes: string; if_no: string; yes_step_id?: string; no_step_id?: string };
  branches?: { label: string; to?: string }[];
};
