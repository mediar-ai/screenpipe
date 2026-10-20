// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkflowLibrary } from "../../../../packages/workflows-ui/src/workflow-library";
import { fixtureWorkflowAnalysis } from "../../../../packages/workflows-ui/src/fixture-platform";
import { WorkflowsApp } from "../../../../packages/workflows-ui/src/workflows-app";
import type { WorkflowsPlatform } from "../../../../packages/workflows-ui/src/platform";
import type { WorkflowGuide } from "../../../../packages/workflows-ui/src/guide";

const workflow = { ...fixtureWorkflowAnalysis.analysis.workflows[0], id: "saved-source", revision: 1 };
const guide: WorkflowGuide = { version: 1, workflowKey: "saved-source", sourceRevision: 1, title: "Research SOP", summary: "Saved summary", prerequisites: [], steps: [{ title: "Collect sources", instruction: "Keep the useful sources.", sourceStage: 0, expectedResult: "", includeImage: false }], exceptions: [], completion: [], questions: [] };
function platform(): WorkflowsPlatform {
  return {
    ensureRuntime: vi.fn().mockResolvedValue({ recording: false, source: "screenpipe" }),
    analyzeCapturedWork: vi.fn(),
    guides: { list: vi.fn().mockResolvedValue([guide]), load: vi.fn().mockResolvedValue(guide), save: vi.fn(), export: vi.fn(), generate: vi.fn() },
    library: { listSkillDrafts: vi.fn().mockResolvedValue([{ workflowKey: "skill-source", draft: { name: "Review skill", description: "Review sources", instructions: "Read sources", sourceWorkflow: "Research" } }]), saveSkillDraft: vi.fn().mockResolvedValue(undefined), listInstalledSkills: vi.fn().mockResolvedValue([]) },
    saveWorkflowSkill: vi.fn(),
  };
}
beforeEach(() => { window.history.replaceState(null, "", "/?view=library"); localStorage.clear(); sessionStorage.clear(); });
afterEach(cleanup);
it("opens a saved SOP with no source workflow without regenerating it", async () => {
  const p = platform();
  render(<WorkflowLibrary platform={p} workflows={[]} />);
  fireEvent.click(await screen.findByRole("button", { name: /Research SOP/ }));
  expect(await screen.findByText("Saved summary")).toBeTruthy();
  expect(p.guides!.generate).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Back to Library" })).toBeTruthy();
  expect(new URLSearchParams(location.search).get("libraryItem")).toBe(guide.workflowKey);
});
it("reopens the selected SOP from its URL after remount", async () => {
  window.history.replaceState(null, "", "/?view=library&libraryItem=saved-source");
  const p = platform();
  const view = render(<WorkflowLibrary platform={p} workflows={[workflow]} />);
  expect(await screen.findByText("Saved summary")).toBeTruthy();
  view.unmount();
  render(<WorkflowLibrary platform={p} workflows={[workflow]} />);
  expect(await screen.findByText("Saved summary")).toBeTruthy();
  expect(p.guides!.generate).not.toHaveBeenCalled();
});
it("retains a load error and retries instead of offering to create over saved SOPs", async () => {
  const p = platform(); vi.mocked(p.guides!.list!).mockRejectedValueOnce(new Error("Saved SOPs unreadable"));
  render(<WorkflowLibrary platform={p} workflows={[]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Saved SOPs unreadable");
  expect(screen.queryByText("No saved SOPs yet")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: /Research SOP/ })).toBeTruthy();
});
it("opens and autosaves a skill without installing it", async () => {
  const p = platform(); render(<WorkflowLibrary platform={p} workflows={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Skills", exact: true }));
  fireEvent.click(await screen.findByRole("button", { name: /Review skill/ }));
  fireEvent.change(screen.getByLabelText("When to use"), { target: { value: "Read and compare sources" } });
  await waitFor(() => expect(p.library!.saveSkillDraft).toHaveBeenCalledWith("skill-source", expect.objectContaining({ description: "Read and compare sources" })));
  expect(p.saveWorkflowSkill).not.toHaveBeenCalled();
});
it("shows saved drafts when installed-skill discovery fails", async () => {
  const p = platform(); vi.mocked(p.library!.listInstalledSkills!).mockRejectedValue(new Error("Offline"));
  render(<WorkflowLibrary platform={p} workflows={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Skills", exact: true }));
  expect(await screen.findByRole("button", { name: /Review skill/ })).toBeTruthy();
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not check installed skills");
});
it("keeps Library accessible when the workflow backend cannot load", async () => {
  const p = platform(); p.ensureRuntime = vi.fn().mockRejectedValue(new Error("Unavailable"));
  p.loadCapturedWork = vi.fn().mockRejectedValue(new Error("Unavailable"));
  render(<WorkflowsApp platform={p} storageKey={null} />);
  expect(await screen.findByRole("button", { name: /Research SOP/ })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Library" })).toBeTruthy();
});

it("the Library sidebar returns from an open SOP to the saved list", async () => {
  const p = platform();
  render(<WorkflowsApp platform={p} storageKey={null} />);
  fireEvent.click(await screen.findByRole("button", { name: /Research SOP/ }));
  expect(await screen.findByText("Saved summary")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Library", exact: true }));
  expect(await screen.findByRole("button", { name: /Research SOP/ })).toBeTruthy();
  expect(new URLSearchParams(location.search).get("libraryItem")).toBeNull();
});

it("a background workflow revision does not close its open SOP", async () => {
  window.history.replaceState(null, "", "/?view=workflows");
  const p = platform();
  const analysis = { ...fixtureWorkflowAnalysis, analysis: { workflows: [workflow] } };
  p.loadCapturedWork = vi.fn().mockResolvedValue(analysis);
  const view = render(<WorkflowsApp platform={p} initialAnalysis={analysis} storageKey={null} />);
  await waitFor(() => expect(screen.queryByText("Refreshing saved workflows…")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Open map", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "More workflow actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Open SOP", exact: true }));
  expect(await screen.findByText("Saved summary")).toBeTruthy();
  const refreshed = { ...p, loadCapturedWork: vi.fn().mockResolvedValue({ ...analysis, analysis: { workflows: [{ ...workflow, title: "Refined source title", revision: 2 }] } }) };
  view.rerender(<WorkflowsApp platform={refreshed} initialAnalysis={analysis} storageKey={null} />);
  expect(await screen.findByRole("button", { name: "Review screenshots" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Back to workflow" })).toBeTruthy();
  expect(screen.getByText("Saved summary")).toBeTruthy();
  expect(p.guides!.generate).not.toHaveBeenCalled();
});

it("shares the current skill only when Share is clicked", async () => {
  window.history.replaceState(null, "", "/?view=library&libraryTab=skills&libraryItem=skill-source");
  const p = platform(), share = vi.fn();
  render(<WorkflowLibrary platform={p} workflows={[]} onShareDocument={share} />);
  await screen.findByLabelText("Instructions");
  expect(share).not.toHaveBeenCalled();
  expect(screen.getByRole("toolbar", { name: "Instructions formatting" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("When to use"), { target: { value: 'Use: "carefully"' } });
  fireEvent.click(screen.getByRole("button", { name: "Share", exact: true }));
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ kind: "skill", title: "Review skill", markdown: expect.stringContaining(`description: ${JSON.stringify('Use: "carefully"')}`) }));
  expect(p.saveWorkflowSkill).not.toHaveBeenCalled();
});

it("serializes slow skill saves and keeps the newest edit", async () => {
  window.history.replaceState(null, "", "/?view=library&libraryTab=skills&libraryItem=skill-source");
  const p = platform(); let release!: () => void;
  vi.mocked(p.library!.saveSkillDraft).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  render(<WorkflowLibrary platform={p} workflows={[]} />);
  fireEvent.change(await screen.findByLabelText("When to use"), { target: { value: "First edit" } });
  await waitFor(() => expect(p.library!.saveSkillDraft).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("When to use"), { target: { value: "Newest edit" } });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)); });
  expect(p.library!.saveSkillDraft).toHaveBeenCalledTimes(1);
  await act(async () => release());
  await waitFor(() => expect(p.library!.saveSkillDraft).toHaveBeenCalledTimes(2));
  expect(p.library!.saveSkillDraft).toHaveBeenLastCalledWith("skill-source", expect.objectContaining({ description: "Newest edit", instructions: "Read sources" }));
  await screen.findByText("All changes saved");
});

it("retains failed edits across remount and retries the recovered document", async () => {
  window.history.replaceState(null, "", "/?view=library&libraryTab=skills&libraryItem=skill-source");
  const p = platform(); vi.mocked(p.library!.saveSkillDraft).mockRejectedValue(new Error("Disk unavailable"));
  const view = render(<WorkflowLibrary platform={p} workflows={[]} />);
  fireEvent.change(await screen.findByLabelText("When to use"), { target: { value: "Recover this edit" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Disk unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Back to Library" }));
  await waitFor(() => expect(screen.getByLabelText("When to use")).toHaveValue("Recover this edit"));
  view.unmount();
  const recovered = platform();
  render(<WorkflowLibrary platform={recovered} workflows={[]} />);
  expect(await screen.findByLabelText("When to use")).toHaveValue("Recover this edit");
  await waitFor(() => expect(recovered.library!.saveSkillDraft).toHaveBeenCalledWith("skill-source", expect.objectContaining({ description: "Recover this edit" })));
});

it("shares saved recipe edits rather than its source workflow", async () => {
  const p = platform(), share = vi.fn();
  window.history.replaceState(null, "", "/?view=library&libraryItem=saved-source");
  render(<WorkflowLibrary platform={p} workflows={[workflow]} onShareDocument={share} />);
  fireEvent.change(await screen.findByLabelText("SOP title"), { target: { value: "Reviewed recipe" } });
  fireEvent.click(screen.getByRole("button", { name: "Share", exact: true }));
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ kind: "sop", title: "Reviewed recipe", markdown: expect.stringContaining("Keep the useful sources.") }));
});
