// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CloudWorkflowEditor, type CloudProcedure } from "@screenpipe/workflows-ui";
import { cloudProcedureEdit, cloudProcedureRoutes, cloudProcedureWorkflow } from "../../../../packages/workflows-ui/src/cloud-workflow";
import { workflowEdit } from "../../../../packages/workflows-ui/src/workflow-edits";
import { cloudWorkflowMap } from "./cloud-presentation";
const identity = { license_id: "workspace", artifact_id: "orders", workflow_id: "a".repeat(64) };
const base = cloudWorkflowMap({ id: identity.workflow_id, title: "Orders", summary: "Check orders", steps: [], version: 2, updatedAt: "" }, 0);
const step = { id: "review", action: "Review order", kind: "action" as const, app: "Orders", detail: "Check the reference", expected_result: "Matched", caveat: "Retain caveat", required_access: "Orders access", escalation: "Ask manager", response_template: "Confirmed" };
const branching = (): CloudProcedure => ({ revision: 3, source_version: 2, actor_scope: "org_member_v1_" + "b".repeat(64), can_edit: true, review: { frozen: false, status: "unreviewed" }, document: { sop_document: { title: "Retained SOP" }, steps: [
  { ...step, kind: "decision", decision: { condition: "Is it matched?", if_yes: "Confirm", if_no: "Escalate", yes_step_id: "send", no_step_id: "end" } },
  { ...step, id: "hold", action: "Hold order", next_step_id: "end" },
  { ...step, id: "send", action: "Send order", next_step_id: "end" },
] } });
const json = (body: unknown) => new Response(JSON.stringify(body));
function view(value: CloudProcedure) {
  const request = vi.fn<typeof fetch>().mockImplementation(async (url, init) => String(url).includes("/procedure")
    ? init?.method === "PUT" ? json({ revision: 4, review: value.review }) : json(value)
    : json({ conversation: null }));
  render(<CloudWorkflowEditor identity={identity} workflow={base} request={request} back={() => {}} onSaved={() => {}} onDenied={() => {}} />);
  return request;
}
describe("cloud workflow reading modes", () => {
  it("navigates canonical branches without writes and retains edits across views", async () => {
    const value = branching();
    const request = view(value);
    await screen.findByLabelText("Step 1 title");
    expect(screen.getByRole("button", { name: "Walkthrough", pressed: true })).toBeVisible();
    expect(screen.getByLabelText("Step 2 title")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Map", exact: true }));
    expect(screen.getByText("Is it matched?")).toBeVisible();
    expect(screen.getByText("No")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "03 Send order" }));
    expect(screen.getByLabelText("Step 3 title")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Steps", exact: true }));
    expect(screen.getByLabelText("Step 1 title")).toBeVisible();
    expect(screen.getByLabelText("Step 2 title")).toBeVisible();
    expect(request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
    fireEvent.change(screen.getByLabelText("Step 3 title"), { target: { value: "Send confirmation" } });
    fireEvent.click(screen.getByRole("button", { name: "Walkthrough", exact: true }));
    expect(screen.getByLabelText("Step 3 title")).toHaveValue("Send confirmation");
    await screen.findByText("Saved");
    const write = request.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(write[1]?.body))).toMatchObject({ expected_revision: 3, document: {
      sop_document: value.document.sop_document,
      steps: [value.document.steps[0], value.document.steps[1], { ...value.document.steps[2], action: "Send confirmation" }],
    } });
  });
  it.each([{ can_edit: false, frozen: false }, { can_edit: true, frozen: true }])("keeps reading modes under policy %j", async ({ can_edit, frozen }) => {
    const value = branching();
    const request = view({ ...value, can_edit, review: { ...value.review, frozen } });
    await screen.findByRole("heading", { name: "Review order" });
    expect(screen.getByText("Check orders")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next", exact: true }));
    expect(screen.getByRole("heading", { name: "Hold order" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Map", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "03 Send order" }));
    expect(screen.getByRole("heading", { name: "Send order" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Steps", exact: true }));
    expect(screen.getByRole("heading", { name: "Review order" })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open chat" })).not.toBeInTheDocument();
    expect(request.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });
  it("makes cloud step behavior available and applies edits without losing canonical routes", async () => {
    const value = branching();
    value.document.steps[0].caveat = "";
    const request = view(value);
    await screen.findByLabelText("Step 1 title");
    expect(screen.getByText("3 steps")).toBeVisible();
    expect(screen.getByRole("button", { name: "Export workflow" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add expected result to step 1" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Step behavior", exact: true }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Exceptions", exact: true }));
    expect(screen.getByRole("textbox", { name: "Required access for step 1" })).toHaveTextContent("Orders access");
    expect(screen.getByRole("textbox", { name: "Exceptions for step 1" })).toHaveTextContent("");
    expect(screen.queryByLabelText("Linked workflow")).toBeNull();
    expect(request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
    const edit = workflowEdit(cloudProcedureWorkflow(base, value));
    Object.assign(edit.stages[0], { requiredAccess: "Supervisor access", exceptions: "Stop on mismatch", escalation: "Ask operations", responseTemplate: "Reviewed" });
    const saved = cloudProcedureEdit(value, edit);
    expect(saved.document.steps[0]).toMatchObject({ required_access: "Supervisor access", caveat: "Stop on mismatch", escalation: "Ask operations", response_template: "Reviewed", decision: value.document.steps[0].decision });
    expect(saved.document.sop_document).toEqual(value.document.sop_document);
  });
  it("shows view-only metadata and details without mounting edit controls", async () => {
    view({ ...branching(), can_edit: false });
    await screen.findByRole("heading", { name: "Review order" });
    const trigger = screen.getByRole("button", { name: "Workflow details", exact: true });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Workflow details" })).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close workflow details" }));
    expect(screen.queryByRole("dialog", { name: "Workflow details" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Step behavior", exact: true })).toBeNull();
    expect(within(screen.getByRole("article", { name: "Step 1", exact: true })).getByText("Orders access")).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("preserves explicit ends and clears only deleted destinations when editing", () => {
    const value = branching();
    const edit = workflowEdit(cloudProcedureWorkflow(base, value));
    expect(cloudProcedureEdit(value, edit).document).toEqual(value.document);
    edit.stages.pop();
    const result = cloudProcedureEdit(value, edit);
    expect(result.document.steps[0].decision).toMatchObject({ yes_step_id: undefined, no_step_id: "end" });
    expect(result.document.steps[1].next_step_id).toBe("end");
  });
  it("resolves explicit routes, implicit order, ends and unconfigured branches", () => {
    const value = branching();
    value.document.steps[0].decision!.no_step_id = "missing";
    delete value.document.steps[1].next_step_id;
    expect(cloudProcedureRoutes(value)).toEqual([
      { condition: "Is it matched?", kind: "decision", app: "Orders", links: [{ label: "Yes", description: "Confirm", target: 2 }, { label: "No", description: "Escalate", target: null }] },
      { kind: "action", app: "Orders", links: [{ label: "Then", target: 2 }] }, { kind: "action", app: "Orders", links: [{ label: "Then", target: "end" }] },
    ]);
    delete value.document.steps[0].decision;
    expect(cloudProcedureRoutes(value)[0].links.every(link => link.target === null)).toBe(true);
  });
});
