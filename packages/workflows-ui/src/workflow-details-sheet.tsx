// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./workflow-editor.module.css";

/** The same right-edge details sheet for editable and view-only workflows. */
export function WorkflowDetailsSheet({ close, children }: { close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    if (element?.showModal) element.showModal();
    else element?.setAttribute("open", "");
    return () => { element?.close?.(); target?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className={styles.detailsSheet} aria-label="Workflow details" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget && event.clientX < event.currentTarget.getBoundingClientRect().left) close(); }}>
    <div onClick={event => event.stopPropagation()}>
      <header><h2>Workflow details</h2><button type="button" aria-label="Close workflow details" onClick={close}><X size={18} /></button></header>
      {children}
    </div>
  </dialog>;
}
