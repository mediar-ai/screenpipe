// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Copy, Download, MoreHorizontal, Printer, Share2, X } from "lucide-react";
import styles from "./document-actions.module.css";
import { downloadMarkdown, markdownFilename, printMarkdown } from "./document-export";

/** Explicit text projection. Opening the picker never uploads a document. */
export type LibraryShareDocument = { kind: "skill" | "sop"; title: string; markdown: string };

export function DocumentToolbar({ backLabel, onBack, status, children }: {
  backLabel: string; onBack: () => void; status?: ReactNode; children?: ReactNode;
}) {
  return <header className={styles.toolbar}>
    <div><button onClick={onBack}><ArrowLeft size={16} />{backLabel}</button>{status}</div>
    <div className={styles.actions}>{children}</div>
  </header>;
}

export function DocumentActions({ document, onShare, download, children }: {
  document: LibraryShareDocument;
  onShare?: (document: LibraryShareDocument) => void;
  download?: (content: string, filename: string) => Promise<boolean>;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function copy() {
    setError("");
    try { await navigator.clipboard.writeText(document.markdown); setCopied(true); }
    catch { setError("Could not copy. Select and copy the text below."); dialog.current?.showModal(); }
  }
  async function saveFile() {
    setError(""); setBusy(true);
    const filename = document.kind === "skill" ? "SKILL.md" : markdownFilename(document.title, "recipe");
    try {
      await downloadMarkdown(document.markdown, filename, download);
      if (menu.current) menu.current.open = false;
    } catch { setError("Could not download. Your document is still open. Try again."); }
    finally { setBusy(false); }
  }
  function printDocument() {
    if (menu.current) menu.current.open = false;
    try { printMarkdown(document.title, document.markdown); }
    catch { setError("Could not open print preview. Try again."); }
  }
  return <>
    <button className={styles.share} onClick={() => { setCopied(false); setError(""); onShare ? onShare(document) : dialog.current?.showModal(); }}><Share2 size={16} />Share</button>
    <details ref={menu} className={styles.menu} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
      <summary aria-label={`${document.kind === "skill" ? "Skill" : "SOP"} actions`}><MoreHorizontal size={18} /><span>Actions</span></summary>
      <div className={styles.popover}>
        <button onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy Markdown"}</button>
        <button disabled={busy} onClick={() => void saveFile()}><Download size={16} />{document.kind === "skill" ? "Download SKILL.md" : "Download Markdown"}</button>
        <button onClick={printDocument}><Printer size={16} />Print or save PDF</button>
        {children}
      </div>
    </details>
    {error && !dialog.current?.open && <span role="alert" className={styles.error}>{error}</span>}
    <dialog ref={dialog} className={styles.dialog} aria-label={`Share ${document.kind === "skill" ? "skill" : "SOP"}`}>
      <header><h2>Share {document.title}</h2><button aria-label="Close sharing" onClick={() => dialog.current?.close()}><X size={18} /></button></header>
      <p>Copy the document or download it to share. Nothing is published automatically.</p>
      <textarea aria-label="Document to share" readOnly value={document.markdown} onFocus={event => event.target.select()} />
      {error && <p role="alert">{error}</p>}
      <footer><button onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy Markdown"}</button><button disabled={busy} onClick={() => void saveFile()}><Download size={16} />Download</button></footer>
    </dialog>
  </>;
}
