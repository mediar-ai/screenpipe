// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Copy, Download, MoreHorizontal, Printer, Share2, X } from "lucide-react";
import styles from "./document-actions.module.css";
import { DOMSerializer } from "prosemirror-model";
import { procedureMarkdownParser } from "./procedure-markdown";

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
    const filename = document.kind === "skill" ? "SKILL.md" : `${document.title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "recipe"}.md`;
    try {
      if (download) await download(document.markdown, filename);
      else {
        const url = URL.createObjectURL(new Blob([document.markdown], { type: "text/markdown;charset=utf-8" }));
        const link = window.document.createElement("a"); link.href = url; link.download = filename; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (menu.current) menu.current.open = false;
    } catch { setError("Could not download. Your document is still open. Try again."); }
    finally { setBusy(false); }
  }
  function printDocument() {
    if (menu.current) menu.current.open = false;
    // Print only this document. Build DOM from the allowlisted Markdown schema,
    // never raw HTML or the app shell, and keep remote images as references.
    const frame = window.document.createElement("iframe");
    frame.title = "Document print preview";
    frame.style.cssText = "position:fixed;width:0;height:0;border:0";
    window.document.body.appendChild(frame);
    const target = frame.contentDocument;
    if (!target || !frame.contentWindow) { frame.remove(); setError("Could not open print preview."); return; }
    target.title = document.title;
    const style = target.createElement("style");
    style.textContent = "body{font:15px/1.65 system-ui;margin:40px;color:#111}pre{white-space:pre-wrap}h1,h2,h3{line-height:1.3}a{color:inherit}blockquote{border-left:2px solid #aaa;padding-left:16px}";
    target.head.appendChild(style);
    const doc = procedureMarkdownParser.parse(document.markdown);
    target.body.appendChild(DOMSerializer.fromSchema(doc.type.schema).serializeFragment(doc.content, { document: target }));
    frame.contentWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
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
