// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WorkflowEditor } from "../../../../packages/workflows-ui/src/workflow-editor";
import { WorkflowStepEvidence } from "../../../../packages/workflows-ui/src/workflow-step-evidence";
import { createFixtureWorkflowsPlatform, fixtureWorkflowAnalysis } from "../../../../packages/workflows-ui/src/fixture-platform";

afterEach(cleanup);
const workflow = () => structuredClone(fixtureWorkflowAnalysis.analysis.workflows[0]);
const button = (name: string) => screen.getByRole("button", { name, exact: true });
const title = (index: number) => screen.getByRole("textbox", { name: `Step ${index} title`, exact: true });
function editor(stepsOnly = false) {
  const change = vi.fn();
  const save = vi.fn();
  render(<WorkflowEditor workflow={workflow()} save={save} onDraftChange={change} sessionRecovery={false} saveDisabled stepsOnly={stepsOnly} />);
  return { change, save };
}

it("shows one editable step, bounds navigation, and never saves a view change", () => {
  const { change, save } = editor();
  expect(title(3)).toBeVisible();
  fireEvent.click(button("Walkthrough"));
  expect(button("Walkthrough")).toHaveAttribute("aria-pressed", "true");
  expect(title(1)).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "Step 2 title" })).toBeNull();
  expect(button("Previous")).toBeDisabled();
  fireEvent.click(button("Next"));
  expect(title(2)).toBeVisible();
  fireEvent.click(button("Next"));
  expect(title(3)).toBeVisible();
  expect(button("Next")).toBeDisabled();
  expect(screen.getByText("Step 3 of 3")).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Walkthrough step" }), { target: { value: screen.getByRole("option", { name: /^1\./ }).getAttribute("value") } });
  expect(title(1)).toBeVisible();
  expect(change).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

it("keeps the same fields and unfinished edits when changing steps and views", () => {
  const { change } = editor();
  const first = title(1);
  fireEvent.change(first, { target: { value: "My unfinished instruction" } });
  fireEvent.click(button("Walkthrough"));
  fireEvent.click(button("Next"));
  fireEvent.click(button("Previous"));
  expect(title(1)).toBe(first);
  expect(title(1)).toHaveValue("My unfinished instruction");
  fireEvent.click(button("Steps"));
  expect(title(1)).toBe(first);
  expect(title(3)).toBeVisible();
  expect(change.mock.lastCall![0].stages).toHaveLength(3);
  expect(change.mock.lastCall![0].stages[0]).toMatchObject({ name: "My unfinished instruction", sourceIndex: 0 });
});

it("follows the selected step identity when it moves, retaining its source reference", () => {
  const { change } = editor();
  fireEvent.click(button("Walkthrough"));
  fireEvent.click(button("Step 1 actions"));
  fireEvent.click(button("Move step 1 down"));
  expect(title(2)).toHaveValue(workflow().stages[0].name);
  expect(screen.queryByRole("textbox", { name: "Step 1 title" })).toBeNull();
  expect(screen.getByText("Step 2 of 3")).toBeVisible();
  expect(change.mock.lastCall![0].stages[1].sourceIndex).toBe(0);
});

it("opens inserted steps and keeps navigation valid after deleting them", () => {
  editor();
  fireEvent.click(button("Walkthrough"));
  fireEvent.click(button("Step 1 actions"));
  fireEvent.click(button("Add step below"));
  expect(title(2)).toHaveValue("");
  expect(screen.getByText("Step 2 of 4")).toBeVisible();
  fireEvent.click(button("Step 2 actions"));
  fireEvent.click(button("Delete step 2"));
  expect(title(2)).toHaveValue(workflow().stages[1].name);
  expect(screen.getByText("Step 2 of 3")).toBeVisible();
});

it("leaves the cloud steps-only consumer's view controls with its host", () => {
  editor(true);
  expect(screen.queryByRole("group", { name: "Workflow view" })).toBeNull();
  expect(title(3)).toBeVisible();
});

it("enlarges an existing screenshot without selecting, deleting or reordering it", () => {
  const prototype = HTMLDialogElement.prototype;
  const originalShow = Object.getOwnPropertyDescriptor(prototype, "showModal");
  const originalClose = Object.getOwnPropertyDescriptor(prototype, "close");
  Object.defineProperty(prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
  try {
    const source = workflow();
    const change = vi.fn();
    render(<WorkflowStepEvidence workflow={source} stage={source.stages[0]} platform={createFixtureWorkflowsPlatform()} onImageLayoutChange={change} />);
    fireEvent.click(button(`Enlarge screenshot for ${source.stages[0].name}`));
    const dialog = screen.getByRole("dialog", { name: `Enlarged screenshot for ${source.stages[0].name}` });
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", source.stages[0].screenshot!.dataUrl);
    expect(button(`Select screenshot for ${source.stages[0].name}`)).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close screenshot" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(change).not.toHaveBeenCalled();
  } finally {
    if (originalShow) Object.defineProperty(prototype, "showModal", originalShow); else Reflect.deleteProperty(prototype, "showModal");
    if (originalClose) Object.defineProperty(prototype, "close", originalClose); else Reflect.deleteProperty(prototype, "close");
  }
});
