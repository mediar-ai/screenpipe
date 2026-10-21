// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { Fragment } from "react";
import { ArrowDown, Braces, ChevronLeft, ChevronRight, GitBranch, ListOrdered, PanelsTopLeft } from "lucide-react";
import styles from "./workflow-editor.module.css";

export type WorkflowReadingView = "walkthrough" | "map" | "steps";
export type WorkflowMapRoute = {
  condition?: string;
  links: { label: string; target: number | "end" | null }[];
};
export function WorkflowReadingControls({ view, change, variables }: {
  view: WorkflowReadingView; change: (view: WorkflowReadingView) => void;
  variables?: { open: boolean; toggle: () => void };
}) {
  return <div className={styles.stepsHeading}>
    <span className={styles.workflowTab}>Workflow</span>
    <div className={styles.viewTools}>
      <div role="group" aria-label="Workflow view" className={styles.viewSwitch}>
        {([{ value: "walkthrough", label: "Walkthrough", icon: PanelsTopLeft }, { value: "map", label: "Map", icon: GitBranch }, { value: "steps", label: "Steps", icon: ListOrdered }] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-label={label} title={label} aria-pressed={view === value} onClick={() => change(value)}><Icon size={16} aria-hidden="true" /><span hidden={view !== value}>{label}</span></button>)}
      </div>
      {variables && <button type="button" aria-label="Variables" title="Variables" aria-expanded={variables.open} onClick={variables.toggle}><Braces size={16} /></button>}
    </div>
  </div>;
}
export function WorkflowReadingMap({ steps, selected, choose, routes }: {
  steps: { name: string }[]; selected: number; choose: (index: number) => void; routes?: WorkflowMapRoute[];
}) {
  return <nav className={styles.map} aria-label="Workflow map">
    {steps.map((stage, index) => <Fragment key={index}>
      {!routes && index > 0 && <ArrowDown size={16} aria-hidden="true" />}
      <button type="button" aria-label={`Go to step ${index + 1}: ${stage.name || "Untitled step"}`} aria-pressed={index === selected} onClick={() => choose(index)}><span>{String(index + 1).padStart(2, "0")}</span>{stage.name || "Untitled step"}</button>
      {routes?.[index] && <div className={styles.mapRoutes}>
        {routes[index].condition && <p>{routes[index].condition}</p>}
        {routes[index].links.map((link, i) => { const target = link.target; return typeof target === "number" && steps[target]
          ? <button key={i} type="button" aria-label={`From step ${index + 1}: ${link.label}, go to step ${target + 1}`} onClick={() => choose(target)}>{link.label} → {steps[target].name || `Step ${target + 1}`}</button>
          : <span key={i}>{link.label} → {link.target === "end" ? "End" : "Destination not set"}</span>; })}
      </div>}
    </Fragment>)}
  </nav>;
}
export function WorkflowReadingNavigation({ index, count, choose }: { index: number; count: number; choose: (index: number) => void }) {
  return <nav aria-label="Walkthrough navigation" className={styles.walkthroughNavigation}>
    <button type="button" disabled={index === 0} onClick={() => choose(index - 1)}><ChevronLeft size={16} />Previous</button>
    <span>{index + 1} / {count}</span>
    <button type="button" disabled={index === count - 1} onClick={() => choose(index + 1)}>Next<ChevronRight size={16} /></button>
  </nav>;
}
