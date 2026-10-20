// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Download, Printer, X } from "lucide-react";
import { downloadMarkdown, markdownFilename, printMarkdown, type DownloadDocument } from "./document-export";
import type { WorkflowEdit } from "./workflow-edits";
import type { WorkflowSecondaryAction } from "./workflow-more-actions";
import { workflowMarkdown } from "./workflow-markdown";
import styles from "./document-actions.module.css";

export function useWorkflowDocumentExports(draft: WorkflowEdit, download?: DownloadDocument) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [fallback, setFallback] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(""), 2500);
    return () => clearTimeout(timer);
  }, [status]);
  async function copy() {
    const markdown = workflowMarkdown(draft);
    setStatus(""); setError("");
    try { await navigator.clipboard.writeText(markdown); setStatus("Markdown copied"); }
    catch {
      setFallback(markdown);
      setError("Could not copy. Select and copy the text below.");
      dialog.current?.showModal();
    }
  }
  const actions: WorkflowSecondaryAction[] = [
    { label: "Copy Markdown", icon: Copy, separatorBefore: true, onSelect: () => void copy() },
    { label: "Download Markdown", icon: Download, disabled: busy, onSelect: async () => {
      setStatus(""); setError(""); setBusy(true);
      try { await downloadMarkdown(workflowMarkdown(draft), markdownFilename(draft.title), download); }
      catch { setError("Could not download. Your document is still open. Try again."); }
      finally { setBusy(false); }
    } },
    { label: "Print or save PDF", icon: Printer, onSelect: () => {
      setStatus(""); setError("");
      try { printMarkdown(draft.title, workflowMarkdown(draft)); }
      catch { setError("Could not open print preview. Try again."); }
    } },
  ];
  const feedback = <>
    {status && <p role="status">{status}</p>}
    {error && !fallback && <p role="alert" className={styles.error}>{error}</p>}
    <dialog ref={dialog} className={styles.dialog} aria-label="Copy workflow Markdown" onClose={() => { setFallback(""); setError(""); }}>
      <header><h2>Copy Markdown</h2><button type="button" aria-label="Close Markdown" onClick={() => dialog.current?.close()}><X size={18} /></button></header>
      <p role="alert">{error}</p>
      <textarea aria-label="Workflow Markdown" readOnly value={fallback} onFocus={event => event.target.select()} />
    </dialog>
  </>;
  return { actions, feedback };
}
