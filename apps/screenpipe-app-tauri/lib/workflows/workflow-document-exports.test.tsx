// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkflowEditor, WorkflowDocument } from "../../../../packages/workflows-ui/src/workflow-editor";
import { workflowEdit } from "../../../../packages/workflows-ui/src/workflow-edits";
import { workflowMarkdown } from "../../../../packages/workflows-ui/src/workflow-markdown";
import { printMarkdown } from "../../../../packages/workflows-ui/src/document-export";
import { fixtureWorkflowAnalysis } from "../../../../packages/workflows-ui/src/fixture-platform";

const source = () => structuredClone(fixtureWorkflowAnalysis.analysis.workflows[0]);
function choose(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "More workflow actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name, exact: true }));
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); });

it("exports authored context without captured sources or review history", () => {
  const workflow = source();
  workflow.reviewNote = "PRIVATE REVIEW NOTE";
  workflow.people = ["PRIVATE PERSON"];
  Object.assign(workflow.stages[0], { evidence: [{ detail: "PRIVATE CAPTURE" }], screenshot: "PRIVATE SCREENSHOT" });
  Object.assign(workflow.stages[0], { requiredAccess: "Reporting access", exceptions: "Stop without evidence", escalation: "Ask the owner", responseTemplate: "Hello **team**", linkedWorkflowId: "linked-review" });
  workflow.variables = [{ id: "customer", name: "Customer", kind: "input", description: "Account name", examples: [{ stepId: "step-0", field: "description", value: "Acme" }] }];
  const draft = workflowEdit(workflow);
  draft.stages[0].procedure = (["action", "input", "output", "decision", "check"] as const).map((kind, sourceIndex) => ({ kind, sourceIndex, text: `Keep ${kind} and \`code\`` }));
  const markdown = workflowMarkdown(draft);
  for (const text of [workflow.title, workflow.description, workflow.trigger, workflow.outcome, "Reporting access", "Stop without evidence", "Ask the owner", "Hello **team**", "linked-review", "Customer (input)", "Acme"]) expect(markdown).toContain(text);
  for (const block of draft.stages[0].procedure) expect(markdown).toContain(block.text);
  expect(markdown).not.toMatch(/PRIVATE REVIEW NOTE|PRIVATE PERSON|PRIVATE CAPTURE|PRIVATE SCREENSHOT|sourceIndex|expected_revision/);
});
it("copies the current unsaved draft without saving or adding toolbar buttons", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined), save = vi.fn();
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  render(<WorkflowEditor workflow={source()} save={save} sessionRecovery={false} saveDisabled />);
  fireEvent.change(screen.getByRole("textbox", { name: "Workflow title" }), { target: { value: "Unsaved title" } });
  expect(screen.queryByRole("button", { name: "Copy Markdown" })).toBeNull();
  choose("Copy Markdown");
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("# Unsaved title")));
  expect(save).not.toHaveBeenCalled();
  expect(await screen.findByText("Markdown copied")).toBeVisible();
});
it("keeps failed clipboard text selectable and supports read-only exports without archive", async () => {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  render(<WorkflowDocument workflow={source()} />);
  fireEvent.click(screen.getByRole("button", { name: "More workflow actions" }));
  expect(screen.queryByRole("menuitem", { name: "Archive workflow" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy Markdown" }));
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Workflow Markdown" })).toHaveValue(workflowMarkdown(workflowEdit(source())));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});
it("uses the download adapter, lets failures retry, and makes no cancelled-save claim", async () => {
  const download = vi.fn().mockRejectedValueOnce(new Error("No access")).mockResolvedValue(false);
  render(<WorkflowDocument workflow={source()} downloadDocument={download} />);
  choose("Download Markdown");
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not download");
  choose("Download Markdown");
  await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
  expect(download).toHaveBeenLastCalledWith(workflowMarkdown(workflowEdit(source())), expect.stringMatching(/\.md$/));
  expect(screen.queryByText(/downloaded/i)).toBeNull();
});
it("archives through normal revision-checked saving and retains review fields", async () => {
  const workflow = { ...source(), reviewNote: "Check access", reviewStatus: "needs-edits" as const, revision: 3 };
  const save = vi.fn(async (draft) => ({ ...workflow, archived: draft.archived, revision: 4 }));
  render(<WorkflowEditor workflow={workflow} save={save} sessionRecovery={false} />);
  choose("Archive workflow");
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ archived: true, expected_revision: 3, reviewNote: "Check access", reviewStatus: "needs-edits" })), { timeout: 2000 });
});
it.each(["disabled", "dirty", "stale"])("disables archive for a %s editor", (reason) => {
  const workflow = source(), draft = workflowEdit(workflow);
  if (reason === "dirty") draft.title = "Unsaved";
  if (reason === "stale") draft.expected_revision += 1;
  render(<WorkflowEditor workflow={workflow} initialDraft={draft} save={vi.fn()} sessionRecovery={false} saveDisabled={reason === "disabled"} />);
  fireEvent.click(screen.getByRole("button", { name: "More workflow actions" }));
  expect(screen.getByRole("menuitem", { name: "Archive workflow" })).toBeDisabled();
});
it("prints safe document content and cleans up the temporary frame", () => {
  const append = document.body.appendChild.bind(document.body);
  let frame: HTMLIFrameElement | undefined;
  const print = vi.fn();
  vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
    const result = append(node);
    if (node instanceof HTMLIFrameElement) { frame = node; frame.contentWindow!.print = print; }
    return result;
  });
  printMarkdown("Review", '# Review\n\n<script>bad()</script>\n\n![source](https://example.com/private.png)');
  expect(print).toHaveBeenCalledOnce();
  expect(frame!.contentDocument!.body.textContent).toContain("Review");
  expect(frame!.contentDocument!.querySelector("script, img")).toBeNull();
  frame!.contentWindow!.dispatchEvent(new Event("afterprint"));
  expect(frame!.isConnected).toBe(false);
});
