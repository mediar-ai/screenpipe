// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronRight, Search, Sparkles } from "lucide-react";
import { guideKey, type WorkflowGuide as Guide } from "./guide";
import type { WorkflowMap, WorkflowSkillDraft } from "./model";
import type { WorkflowsPlatform } from "./platform";
import { WorkflowGuide } from "./workflow-guide";
import styles from "./workflow-library.module.css";
import { SopDocument } from "./sop-document";
import { WorkflowRichText as SkillInstructionsEditor } from "./rich-text";
import { InlineText } from "./inline-text";
import { DocumentActions, DocumentToolbar, type LibraryShareDocument } from "./document-actions";
import { skillMarkdown } from "./skill-document";

type Draft = { workflowKey: string; draft: WorkflowSkillDraft };
type Installed = { name: string; description: string; path: string };
const message = (error: unknown) => error instanceof Error ? error.message : "Could not load your library. Try again.";

// A removed source must not make its saved document inaccessible or invent evidence.
export function detachedGuideWorkflow(guide: Guide): WorkflowMap {
  return {
    id: guide.workflowKey, revision: guide.sourceRevision, title: guide.title,
    description: guide.summary, rank: 0, analysisDays: 0, repetitions: 0, frequency: "",
    trigger: "", outcome: "", totalMinutes: 0, activeMinutes: 0, waitingMinutes: 0,
    appSwitches: 0, confidence: 0, apps: [], handoffs: [], variations: [], stages: [],
    bottlenecks: [], evidence: [], quality: { grade: "limited", evidenceCount: 0,
      distinctDays: 0, stageEvidenceCoverage: 0, repeatedStageCoverage: 0,
      screenshotCount: 0, stageScreenshotCoverage: 0, reasons: [] },
  };
}

export function WorkflowLibrary({ platform, workflows, onShareDocument }: { platform: WorkflowsPlatform; workflows: WorkflowMap[]; onShareDocument?: (document: LibraryShareDocument) => void }) {
  const [tab, setTab] = useState<"sops" | "skills">(() => new URLSearchParams(window.location.search).get("libraryTab") === "skills" ? "skills" : "sops");
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get("libraryItem"));
  const [guides, setGuides] = useState<Guide[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [installed, setInstalled] = useState<Installed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [installedError, setInstalledError] = useState("");
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const refresh = () => setRevision(value => value + 1);
  function route(nextTab: typeof tab, item: string | null) {
    setTab(nextTab); setSelected(item); setQuery("");
    const url = new URL(window.location.href);
    url.searchParams.set("view", "library"); url.searchParams.set("libraryTab", nextTab);
    if (item) url.searchParams.set("libraryItem", item); else url.searchParams.delete("libraryItem");
    window.history.pushState(null, "", url);
  }
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setTab(params.get("libraryTab") === "skills" ? "skills" : "sops");
      setSelected(params.get("libraryItem"));
      refresh();
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setInstalledError("");
    const load = tab === "sops"
      ? (platform.guides?.list?.() ?? Promise.resolve([])).then(value => { if (!cancelled) setGuides(value); })
      : (platform.library?.listSkillDrafts() ?? Promise.resolve([])).then(value => { if (!cancelled) setDrafts(value); });
    void load.catch(cause => { if (!cancelled) setError(message(cause)); }).finally(() => { if (!cancelled) setLoading(false); });
    if (tab === "skills" && platform.library?.listInstalledSkills) {
      void platform.library.listInstalledSkills().then(value => { if (!cancelled) setInstalled(value); }).catch(() => { if (!cancelled) setInstalledError("Could not check installed skills. Your saved drafts are still available."); });
    }
    return () => { cancelled = true; };
  }, [platform, tab, revision]);
  const close = () => { route(tab, null); refresh(); };
  const guide = guides.find(item => item.workflowKey === selected);
  const source = guide && workflows.find(workflow => guideKey(workflow) === guide.workflowKey);
  if (tab === "sops" && guide && platform.guides) {
    // Load by the saved key, including when the source is no longer in the catalog.
    const adapter = source ? platform.guides : { ...platform.guides, edit: undefined, video: undefined };
    return <><WorkflowGuide key={guide.workflowKey} workflow={source ?? detachedGuideWorkflow(guide)} platform={adapter} sourceMissing={!source} onShareDocument={onShareDocument} downloadDocument={platform.library?.downloadDocument} close={close} backLabel="Back to Library" /></>;
  }
  const draft = drafts.find(item => item.workflowKey === selected);
  if (tab === "skills" && draft && platform.library) return <LibrarySkill key={draft.workflowKey} entry={draft} platform={platform} onShareDocument={onShareDocument} close={close} />;
  const filter = (title: string, summary: string) => `${title} ${summary}`.toLowerCase().includes(query.toLowerCase());
  const visibleGuides = guides.filter(g => filter(g.title, g.summary));
  const visibleDrafts = drafts.filter(d => filter(d.draft.name, d.draft.description));
  const visibleInstalled = installed.filter(skill => !drafts.some(d => d.draft.name === skill.name) && filter(skill.name, skill.description));
  const count = tab === "sops" ? visibleGuides.length : visibleDrafts.length + visibleInstalled.length;
  return <section className={styles.library}>
    <h1>Library</h1><p className={styles.subtitle}>Your saved SOPs and skills.</p>
    <div className={styles.controls}><div className={styles.tabs} aria-label="Library sections">{(["sops", "skills"] as const).map(value => <button key={value} aria-pressed={tab === value} onClick={() => route(value, null)}>{value === "sops" ? "SOPs" : "Skills"}</button>)}</div>
      <label className={styles.search}><Search size={16} /><input aria-label="Search library" placeholder={tab === "sops" ? "Search SOPs" : "Search skills"} value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    {error && <p role="alert">{error} <button onClick={refresh}>Try again</button></p>}
    {installedError && tab === "skills" && <p role="alert">{installedError} <button onClick={refresh}>Try again</button></p>}
    {loading ? <p role="status">Loading your library…</p> : !error && <>
      {selected && <p role="status">This item could not be found in the saved library.</p>}
      {!count && <div className={styles.empty}>{tab === "sops" ? <BookOpen size={24} /> : <Sparkles size={24} />}<h2>{query ? "No matching items" : tab === "sops" ? "No saved SOPs yet" : "No saved skills yet"}</h2><p>{query ? "Try another search." : `Open a workflow and choose ${tab === "sops" ? "Create SOP" : "Create skill"}. It will be saved here.`}</p></div>}
      <div className={styles.items}>{tab === "sops" ? visibleGuides.map(g => <button className={styles.row} key={g.workflowKey} onClick={() => route("sops", g.workflowKey)}><BookOpen size={19} /><span><strong>{g.title}</strong><small>{g.steps.length} steps</small></span><ChevronRight size={17} /></button>) : <>
        {visibleDrafts.map(d => <button className={styles.row} key={d.workflowKey} onClick={() => route("skills", d.workflowKey)}><Sparkles size={19} /><span><strong>{d.draft.name || "Untitled skill"}</strong><small>{d.draft.description}</small></span><ChevronRight size={17} /></button>)}
        {visibleInstalled.map(s => <details className={styles.installed} key={s.path}><summary><Sparkles size={19} /><span><strong>{s.name}</strong><small>{s.description}</small></span><small>Installed</small></summary><p>Available to Screenpipe on this device.</p><code>{s.path}</code></details>)}
      </>}</div>
    </>}
  </section>;
}

function LibrarySkill({ entry, platform, close, onShareDocument }: { entry: Draft; platform: WorkflowsPlatform; close: () => void; onShareDocument?: (document: LibraryShareDocument) => void }) {
  const recoveryKey = `screenpipe:skill-draft:${entry.workflowKey}`;
  const [draft, setDraft] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(recoveryKey) || "null");
      if (saved && typeof saved.name === "string" && typeof saved.description === "string" && typeof saved.instructions === "string") return { ...entry.draft, ...saved } as WorkflowSkillDraft;
    } catch { /* Disk draft remains authoritative when recovery is unavailable. */ }
    return entry.draft;
  });
  const [status, setStatus] = useState("All changes saved");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(draft !== entry.draft);
  const latest = useRef(draft);
  const version = useRef(draft !== entry.draft ? 1 : 0);
  const savedVersion = useRef(0);
  const writes = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);
  async function flush() {
    clearTimeout(timer.current);
    const target = latest.current, revision = version.current;
    const write = writes.current.catch(() => {}).then(async () => {
      if (revision <= savedVersion.current) return;
      await platform.library!.saveSkillDraft(entry.workflowKey, target);
      savedVersion.current = revision;
      if (revision === version.current) {
        try { sessionStorage.removeItem(recoveryKey); } catch { /* Saved on disk. */ }
        if (mounted.current) { setDirty(false); setStatus("All changes saved"); setError(""); }
      }
    });
    writes.current = write;
    try { await write; }
    catch (cause) {
      if (mounted.current && revision === version.current) { setStatus("Not saved"); setError(message(cause)); }
      throw cause;
    }
  }
  useEffect(() => {
    mounted.current = true;
    if (version.current) void flush().catch(() => {});
    return () => { mounted.current = false; clearTimeout(timer.current); void flush().catch(() => {}); };
  }, []);
  function change(next: WorkflowSkillDraft) {
    latest.current = next; version.current++; setDraft(next); setDirty(true); setStatus("Saving…"); setError("");
    try { sessionStorage.setItem(recoveryKey, JSON.stringify(next)); } catch { /* Show save errors if disk persistence fails. */ }
    clearTimeout(timer.current); timer.current = setTimeout(() => void flush().catch(() => {}), 350);
  }
  async function install() {
    setBusy(true); setError("");
    const target = latest.current;
    try {
      await flush();
      const receipt = await platform.saveWorkflowSkill!(target);
      setStatus([...receipt.destinations.map(d => `Installed in ${d}.`), ...receipt.warnings].join(" ") || "No installation completed.");
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  return <section className={styles.skillPage}>
    <DocumentToolbar backLabel="Back to Library" onBack={() => { void flush().then(close).catch(() => {}); }} status={<span role="status" className={styles.saveStatus}>{status}</span>}>
      {error && <button onClick={() => void flush().catch(() => {})}>Retry save</button>}
      <DocumentActions document={{ kind: "skill", title: draft.name, markdown: skillMarkdown(draft) }} onShare={onShareDocument} download={platform.library?.downloadDocument}>
        {platform.saveWorkflowSkill && <button disabled={busy || !draft.name.trim() || !draft.instructions.trim() || !draft.description.trim()} onClick={() => void install()}>{busy ? "Installing…" : platform.skillInstallMode === "preview" ? "Preview installation" : "Install in my agents"}</button>}
      </DocumentActions>
    </DocumentToolbar>
    {error && <p role="alert" className={styles.saveError}>{error} Your draft is kept in this tab.</p>}
    <div className={styles.skillLayout}>
      <SopDocument kind="skill" title={draft.name} onTitleChange={name => change({ ...latest.current, name })}>
        <div className={styles.description}><span>When to use</span><InlineText label="When to use" value={draft.description} maxLength={500} onChange={description => change({ ...latest.current, description })} /></div>
        <SkillInstructionsEditor label="Instructions" fullDocument maxLength={20000} value={draft.instructions} onChange={instructions => change({ ...latest.current, instructions })} />
      </SopDocument>
      <aside className={styles.source}><p>Source workflow</p><strong>{draft.sourceWorkflow || "Saved skill"}</strong><p>{dirty ? "Unsaved changes" : "Saved on this device"}</p></aside>
    </div>
  </section>;
}
