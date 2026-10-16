// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import type { WorkflowSkillDraft } from "./model";

/** JSON strings are valid YAML scalars, including colons, quotes and newlines. */
export function skillMarkdown(draft: WorkflowSkillDraft): string {
  return `---\nname: ${JSON.stringify(draft.name)}\ndescription: ${JSON.stringify(draft.description)}\n---\n\n${draft.instructions}\n`;
}
