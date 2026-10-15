// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocumentActions } from "../../../../packages/workflows-ui/src/document-actions";
import { skillMarkdown } from "../../../../packages/workflows-ui/src/skill-document";
import { parse } from "yaml";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const document = { kind: "skill" as const, title: "Review", markdown: "# Review\n\nKeep the sources." };
it("round-trips metadata through YAML without dropping instructions", () => {
  const skill = { name: 'review: "sources"', description: "First line\nSecond line: verify", instructions: "## Read\n\nKeep **every** source.", sourceWorkflow: "Research" };
  const markdown = skillMarkdown(skill);
  expect(parse(markdown.split("---")[1])).toEqual({ name: skill.name, description: skill.description });
  expect(markdown).toContain(skill.instructions);
});
it("downloads only after the user chooses the action and does not claim a cancelled save", async () => {
  const download = vi.fn().mockResolvedValue(false);
  render(<DocumentActions document={document} download={download} />);
  expect(download).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Actions"));
  fireEvent.click(screen.getByRole("button", { name: "Download SKILL.md" }));
  await waitFor(() => expect(download).toHaveBeenCalledWith(document.markdown, "SKILL.md"));
  expect(screen.queryByText(/downloaded/i)).toBeNull();
});
it("keeps a failed download recoverable", async () => {
  const download = vi.fn().mockRejectedValueOnce(new Error("No access")).mockResolvedValue(true);
  render(<DocumentActions document={document} download={download} />);
  fireEvent.click(screen.getByText("Actions"));
  fireEvent.click(screen.getByRole("button", { name: "Download SKILL.md" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not download");
  fireEvent.click(screen.getByRole("button", { name: "Download SKILL.md" }));
  await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
});
it("provides selectable text when clipboard access fails", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  render(<DocumentActions document={document} />);
  fireEvent.click(screen.getByText("Actions"));
  fireEvent.click(screen.getByRole("button", { name: "Copy Markdown" }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Document to share" })).toHaveValue(document.markdown);
  expect(screen.getByRole("alert")).toHaveTextContent("Select and copy");
});
