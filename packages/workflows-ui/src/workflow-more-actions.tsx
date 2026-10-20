// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import styles from "./workflow-more-actions.module.css";

export type WorkflowSecondaryAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  expanded?: boolean;
  separatorBefore?: boolean;
  shortcut?: string;
};

/** Occasional document tools follow the Studio's single overflow menu. */
export function WorkflowMoreActions({ actions }: { actions: WorkflowSecondaryAction[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<"first" | "last">("first");
  const id = useId();
  const choices = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function select(action: WorkflowSecondaryAction) {
    if (action.disabled) return;
    // Restore before invoking the action so newly opened dialogs can take focus.
    close(true);
    action.onSelect();
  }
  useEffect(() => {
    if (!open) return;
    const items = choices();
    items[initialFocus.current === "last" ? items.length - 1 : 0]?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  if (!actions.length) return null;
  return <div ref={root} className={styles.root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) close();
  }} onKeyDown={event => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(true); }
  }}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label="More workflow actions" title="More workflow actions" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { initialFocus.current = "first"; setOpen(!open); }}
      onKeyDown={event => {
        if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault(); initialFocus.current = event.key === "ArrowUp" ? "last" : "first"; setOpen(true);
        }
      }}><MoreHorizontal size={18} aria-hidden="true" /></button>
    {open && <div ref={menu} id={id} className={styles.menu} role="menu" aria-label="Workflow actions" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); close(true); return; }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = choices(), index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length]?.focus();
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && !event.nativeEvent.isComposing) {
        const action = actions.find(item => item.shortcut?.toLowerCase() === event.key.toLowerCase());
        if (action && !action.disabled) { event.preventDefault(); select(action); }
      }
    }}>
      {actions.map(action => <Fragment key={action.label}>
        {action.separatorBefore && <div role="separator" className={styles.separator} />}
        <button type="button" role="menuitem" tabIndex={-1} disabled={action.disabled} aria-expanded={action.expanded} onClick={() => select(action)}>
          <action.icon size={16} aria-hidden="true" /><span>{action.label}</span>{action.shortcut && <kbd aria-hidden="true">{action.shortcut}</kbd>}
        </button>
      </Fragment>)}
    </div>}
  </div>;
}
