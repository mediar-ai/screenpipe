// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcedureFlowchart } from "../../../../packages/workflows-ui/src/workflow-map";
import type { MapStage } from "../../../../packages/workflows-ui/src/workflow-map-model";
const stages: MapStage[] = [
  { key:"check", stepId:"check", title:"Check order", app:"Orders", kind:"decision", decision:{ condition:"Does it match?", if_yes:"Send confirmation", if_no:"Ask manager", yes_step_id:"send", no_step_id:"end" } },
  { key:"send", stepId:"send", title:"Send confirmation", app:"Mail", kind:"action", nextStepId:"end" },
];
describe("Studio map controls", () => {
  it("searches titles, app names and decisions, selects by Enter, and clears with Escape", () => {
    const select=vi.fn(); render(<ProcedureFlowchart stages={stages} selected="check" onSelect={select} />);
    const search=screen.getByRole("searchbox",{name:"Find a step"});
    fireEvent.change(search,{target:{value:"Mail"}});
    expect(screen.getByText("1 matching step")).toBeVisible();
    fireEvent.keyDown(search,{key:"Enter"}); expect(select).toHaveBeenLastCalledWith("send");
    expect(search).toHaveValue("");
    fireEvent.change(search,{target:{value:"Does it match"}});expect(screen.getByText("1 matching step")).toBeVisible();
    fireEvent.keyDown(search,{key:"Escape"});expect(search).toHaveValue("");
    fireEvent.change(search,{target:{value:"nothing"}});expect(screen.getByText("No steps match")).toBeVisible();
  });
  it("provides Studio zoom bounds, reset, layout selection and honest timing", () => {
    const layout=vi.fn(); render(<ProcedureFlowchart stages={stages} selected="check" onSelect={()=>{}} layout="flow" onLayoutChange={layout} />);
    const plus=screen.getByRole("button",{name:"Zoom in"}),minus=screen.getByRole("button",{name:"Zoom out"});
    fireEvent.click(plus);fireEvent.click(plus);expect(plus).toBeDisabled();
    expect(screen.getByRole("button",{name:"Reset map zoom"})).toHaveTextContent("140%");
    fireEvent.click(screen.getByRole("button",{name:"Reset map zoom"}));
    fireEvent.click(minus);fireEvent.click(minus);expect(minus).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox",{name:"Map layout"}),{target:{value:"apps"}});expect(layout).toHaveBeenCalledWith("apps");
    fireEvent.click(screen.getByRole("button",{name:"Show average active time"}));
    expect(screen.getByLabelText("Average active time legend")).toBeVisible();
    expect(screen.getAllByText("Not measured")).toHaveLength(3);
    expect(screen.getByText("Yes")).toBeVisible();expect(screen.getByText("No")).toBeVisible();
  });
});
