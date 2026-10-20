// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { DOMSerializer } from "prosemirror-model";
import { procedureMarkdownParser } from "./procedure-markdown";

export type DownloadDocument = (content: string, filename: string) => Promise<boolean>;
export function markdownFilename(title: string, fallback = "workflow") {
  return `${title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || fallback}.md`;
}
export async function downloadMarkdown(markdown: string, filename: string, download?: DownloadDocument) {
  if (download) return download(markdown, filename);
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  try {
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return true;
}
export function printMarkdown(title: string, markdown: string) {
  // Print only this document. Build DOM from the allowlisted Markdown schema,
  // never raw HTML or the app shell, and keep remote images as references.
  const frame = window.document.createElement("iframe");
  frame.title = "Document print preview";
  frame.style.cssText = "position:fixed;width:0;height:0;border:0";
  window.document.body.appendChild(frame);
  const target = frame.contentDocument;
  if (!target || !frame.contentWindow) { frame.remove(); throw new Error("Could not open print preview."); }
  target.title = title;
  const style = target.createElement("style");
  style.textContent = "body{font:15px/1.65 system-ui;margin:40px;color:#111}pre{white-space:pre-wrap}h1,h2,h3{line-height:1.3}a{color:inherit}blockquote{border-left:2px solid #aaa;padding-left:16px}";
  target.head.appendChild(style);
  try {
    const doc = procedureMarkdownParser.parse(markdown);
    target.body.appendChild(DOMSerializer.fromSchema(doc.type.schema).serializeFragment(doc.content, { document: target }));
    frame.contentWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  } catch (error) { frame.remove(); throw error; }
}
