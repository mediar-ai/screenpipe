// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import type { WorkflowEdit } from "./workflow-edits";
import { executionFields, variableMarkdown } from "./workflow-variable-model";

/** Export authored instructions only, never captured evidence or review history. */
export function workflowMarkdown(draft: WorkflowEdit): string {
  const parts = [`# ${draft.title}`, draft.description];
  if (draft.trigger) parts.push(`## Trigger\n\n${draft.trigger}`);
  if (draft.outcome) parts.push(`## Outcome\n\n${draft.outcome}`);
  draft.stages.forEach((stage, index) => {
    parts.push(`## ${index + 1}. ${stage.name}`, stage.description);
    for (const block of stage.procedure) {
      parts.push(`### ${block.kind[0].toUpperCase()}${block.kind.slice(1)}\n\n${block.text}`);
    }
    for (const [field, label] of Object.entries(executionFields)) {
      const text = stage[field as keyof typeof executionFields];
      if (text) parts.push(`### ${label}\n\n${text}`);
    }
    if (stage.linkedWorkflowId) parts.push(`Linked workflow: ${stage.linkedWorkflowId}`);
  });
  parts.push(variableMarkdown(draft.variables));
  return parts.filter(Boolean).join("\n\n").trim() + "\n";
}
