// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import type { WorkflowMap, WorkflowVariable } from "./model";

export const executionFields = {
  requiredAccess: "Required access",
  exceptions: "Exceptions",
  escalation: "Escalation",
  responseTemplate: "Response template",
} as const;

export function validVariables(items: unknown): items is WorkflowVariable[] {
  const id = (v: unknown) =>
    typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
  const text = (v: unknown, max: number, required = false) =>
    typeof v === "string" && v.length <= max && (!required || !!v.trim());
  return (
    Array.isArray(items) &&
    items.length <= 40 &&
    new Set(items.map((v) => v?.id)).size === items.length &&
    new Set(items.map((v) => v?.name?.trim().toLowerCase())).size ===
      items.length &&
    items.every(
      (v) =>
        v &&
        id(v.id) &&
        ["input", "output"].includes(v.kind) &&
        text(v.name, 100, true) &&
        text(v.description, 1000) &&
        Array.isArray(v.examples) &&
        v.examples.length <= 20 &&
        v.examples.every(
          (e: WorkflowVariable["examples"][number]) =>
            e &&
            id(e.stepId) &&
            text(e.field, 100, true) &&
            text(e.value, 1000, true),
        ),
    )
  );
}

export function variableMarkdown(items: WorkflowVariable[] = []) {
  return items.length
    ? "\n## Inputs and outputs\n\n" +
        items
          .map(
            (v) =>
              `### ${v.name} (${v.kind})\n\n${v.description}\n\n${v.examples.map((e) => `- Example from instructions: ${e.value} (step ${e.stepId}, ${e.field})`).join("\n")}`,
          )
          .join("\n\n")
    : "";
}

/** Deterministically retain authored execution context in generated portable skills. */
export function workflowAuthoredContext(workflow: WorkflowMap) {
  const details = workflow.stages.flatMap((stage, i) => {
    const fields = Object.entries(executionFields).flatMap(([key, label]) =>
      stage[key as keyof typeof executionFields]
        ? [`**${label}**\n\n${stage[key as keyof typeof executionFields]}`]
        : [],
    );
    if (stage.linkedWorkflowId)
      fields.push(`Linked workflow: ${stage.linkedWorkflowId}`);
    return fields.length
      ? [`### Step ${i + 1}: ${stage.name}\n\n${fields.join("\n\n")}`]
      : [];
  });
  return (
    variableMarkdown(workflow.variables) +
    (details.length
      ? "\n\n## Authored execution details\n\n" + details.join("\n\n")
      : "")
  );
}
