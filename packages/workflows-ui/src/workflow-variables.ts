// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { Fragment, type Node as MarkdownNode } from "prosemirror-model";
import {
  procedureMarkdownParser,
  procedureMarkdownSerializer,
  procedureMarkdownSchema,
} from "./procedure-markdown";
import type { WorkflowVariable } from "./model";
import { executionFields, validVariables } from "./workflow-variable-model";
export { executionFields, validVariables, variableMarkdown, workflowAuthoredContext } from "./workflow-variable-model";
import type { WorkflowEdit, StageEdit } from "./workflow-edits";
export const variableHref = (id: string) => `#workflow-io-${id}`;
export const variableId = (href: string) =>
  /^#workflow-io-([a-zA-Z0-9_-]{1,80})$/.exec(href)?.[1];
export function stageFields(stage: StageEdit) {
  return [
    { id: "description", label: "Instructions", value: stage.description },
    ...stage.procedure.map((p, i) => ({
      id: `block/${p.id ?? `block-${i}`}`,
      label: `Block ${i + 1} · ${p.kind}`,
      value: p.text,
    })),
    ...Object.entries(executionFields).map(([id, label]) => ({
      id,
      label,
      value: stage[id as keyof typeof executionFields] ?? "",
    })),
  ];
}
function mapFields<T extends StageEdit>(
  stage: T,
  map: (text: string, field: string) => string,
): T {
  return {
    ...stage,
    description: map(stage.description, "description"),
    procedure: stage.procedure.map((p, i) => ({
      ...p,
      text: map(p.text, `block/${p.id ?? `block-${i}`}`),
    })),
    ...Object.fromEntries(
      Object.keys(executionFields)
        .filter((key) => key in stage)
        .map((key) => [
          key,
          map(stage[key as keyof typeof executionFields] ?? "", key),
        ]),
    ),
  };
}
/** Replace only exact plain-text values in the chosen field, never URLs, code or substrings of identifiers. */
export function parameterize(
  markdown: string,
  value: string,
  binding: WorkflowVariable,
) {
  let count = 0;
  const word = (char: string) => /[\p{L}\p{N}_-]/u.test(char);
  const visit = (node: MarkdownNode): MarkdownNode[] => {
    if (
      node.type.name === "code_block" ||
      node.marks.some((m) => m.type.name === "code" || m.type.name === "link")
    )
      return [node];
    if (node.isText) {
      const source = node.text!;
      const out: MarkdownNode[] = [];
      let start = 0,
        from = 0;
      // Bare URLs need protection too: the Markdown parser does not autolink them.
      const urls = [
        ...source.matchAll(/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"`]+/giu),
      ].map((match) => ({
        start: match.index!,
        end: match.index! + match[0].length,
      }));
      while (value && from < source.length) {
        const at = source.indexOf(value, from);
        if (at < 0) break;
        from = at + value.length;
        if (urls.some((url) => at < url.end && from > url.start)) continue;
        if (
          (word(value[0]) && at > 0 && word(source[at - 1])) ||
          (word(value.at(-1)!) && from < source.length && word(source[from]))
        )
          continue;
        if (at > start)
          out.push(
            procedureMarkdownSchema.text(source.slice(start, at), node.marks),
          );
        out.push(
          procedureMarkdownSchema.text(binding.name, [
            ...node.marks,
            procedureMarkdownSchema.marks.link.create({
              href: variableHref(binding.id),
            }),
          ]),
        );
        start = from;
        count++;
      }
      if (!out.length) return [node];
      if (start < source.length)
        out.push(procedureMarkdownSchema.text(source.slice(start), node.marks));
      return out;
    }
    const children: MarkdownNode[] = [];
    node.forEach((child) => children.push(...visit(child)));
    return [node.copy(Fragment.fromArray(children))];
  };
  const root = visit(procedureMarkdownParser.parse(markdown))[0];
  return {
    markdown: count ? procedureMarkdownSerializer.serialize(root) : markdown,
    count,
  };
}

export function addVariableExample<T extends WorkflowEdit>(
  document: T,
  binding: WorkflowVariable,
  example: WorkflowVariable["examples"][number],
): T {
  const stage = document.stages.find(
    (s, i) => (s.id ?? `step-${i}`) === example.stepId,
  );
  if (!stage) throw Error("The source step was removed. Choose another step.");
  const field = stageFields(stage).find((f) => f.id === example.field);
  if (!field)
    throw Error("The source field was removed. Choose another field.");
  const existing = document.variables?.find((v) => v.id === binding.id);
  const item = {
    ...(existing ?? binding),
    examples: [...(existing?.examples ?? []), example],
  };
  const variables = [
    ...(document.variables ?? []).filter((v) => v.id !== item.id),
    item,
  ];
  if (!validVariables(variables))
    throw Error(
      "Use a unique name and a nonempty example (up to 20 examples per field).",
    );
  const replaced = parameterize(field.value, example.value, item);
  if (!replaced.count)
    throw Error(
      "That exact value was not found in plain text. Links and code stay unchanged.",
    );
  if (new TextEncoder().encode(replaced.markdown).length > 8000)
    throw Error("This reference makes the field too long.");
  return {
    ...document,
    variables,
    stages: document.stages.map((s) =>
      s === stage
        ? mapFields(s, (value, key) =>
            key === field.id ? replaced.markdown : value,
          )
        : s,
    ),
  };
}
export function updateVariable<T extends WorkflowEdit>(
  document: T,
  id: string,
  replacement?: WorkflowVariable,
): T {
  const variables = (document.variables ?? []).flatMap((v) =>
    v.id !== id ? [v] : replacement ? [replacement] : [],
  );
  if (!validVariables(variables)) throw Error("Use a unique, nonempty name.");
  const visit = (node: MarkdownNode): MarkdownNode => {
    const link = node.marks.find(
      (m) => m.type.name === "link" && m.attrs.href === variableHref(id),
    );
    if (node.isText)
      return link
        ? replacement
          ? procedureMarkdownSchema.text(replacement.name, node.marks)
          : node.mark(node.marks.filter((m) => m !== link))
        : node;
    const children: MarkdownNode[] = [];
    let previousReference = false;
    node.forEach((child) => {
      const reference =
        child.isText &&
        child.marks.some(
          (m) => m.type.name === "link" && m.attrs.href === variableHref(id),
        );
      // A single reference may contain differently formatted text nodes.
      if (!(replacement && reference && previousReference))
        children.push(visit(child));
      previousReference = reference;
    });
    return node.copy(Fragment.fromArray(children));
  };
  return {
    ...document,
    variables,
    stages: document.stages.map((s) =>
      mapFields(s, (value) =>
        value.includes(variableHref(id))
          ? procedureMarkdownSerializer.serialize(
              visit(procedureMarkdownParser.parse(value)),
            )
          : value,
      ),
    ),
  };
}
