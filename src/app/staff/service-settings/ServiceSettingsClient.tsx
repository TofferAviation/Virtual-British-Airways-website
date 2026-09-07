"use client";

import { KeyboardEvent, useEffect, useMemo, useState } from "react";

type SourceFile = {
  path: string;
  size: number;
  updatedAt: string;
};

type SourceDocument = SourceFile & {
  content: string;
  hash: string;
  language: string;
};

type AccessRole = {
  id: string;
  name: string;
  description: string;
  granted: boolean;
};

type AccessUser = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  status: string;
  roleGranted: boolean;
  override: boolean | null;
  effective: boolean;
};

type AccessState = {
  roles: AccessRole[];
  users: AccessUser[];
};

type Props = {
  staffName: string;
  isMasterAdmin: boolean;
};

function fileName(filePath: string) {
  return filePath.split("/").pop() || filePath;
}

function folderName(filePath: string) {
  const parts = filePath.split("/");
  parts.pop();
  return parts.join("/") || "Project root";
}

function fileGlyph(filePath: string) {
  if (filePath.endsWith(".tsx") || filePath.endsWith(".ts")) return "TS";
  if (filePath.endsWith(".jsx") || filePath.endsWith(".js")) return "JS";
  if (filePath.endsWith(".css") || filePath.endsWith(".scss")) return "#";
  if (filePath.endsWith(".json")) return "{}";
  if (filePath.endsWith(".md")) return "M↓";
  if (filePath.endsWith(".svg")) return "◇";
  return "·";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function lineCount(value: string) {
  return Math.max(1, value.split("\n").length);
}

function utf8Size(value: string) {
  return new TextEncoder().encode(value).length;
}

export function ServiceSettingsClient({ staffName, isMasterAdmin }: Props) {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [filter, setFilter] = useState("");
  const [tabs, setTabs] = useState<string[]>([]);
  const [activePath, setActivePath] = useState("");
  const [document, setDocument] = useState<SourceDocument | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Loading source workspace…");
  const [wrap, setWrap] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [access, setAccess] = useState<AccessState | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);

  const dirty = Boolean(document && draft !== document.content);
  const filteredFiles = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? files.filter((file) => file.path.toLowerCase().includes(query)) : files;
  }, [files, filter]);

  const folders = useMemo(() => {
    const grouped = new Map<string, SourceFile[]>();
    for (const file of filteredFiles) {
      const folder = folderName(file.path);
      const bucket = grouped.get(folder) ?? [];
      bucket.push(file);
      grouped.set(folder, bucket);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredFiles]);

  async function loadFiles(selectFirst = false) {
    setLoading(true);
    try {
      const response = await fetch("/api/staff/service-source", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { files?: SourceFile[]; error?: string };
      if (!response.ok || !body.files) throw new Error(body.error || "Could not load source files.");
      setFiles(body.files);
      setMessage(`${body.files.length} editable project files available.`);
      if (selectFirst && body.files[0]) await openFile(body.files[0].path);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load source files.");
    } finally {
      setLoading(false);
    }
  }

  async function openFile(path: string, force = false) {
    if (!force && path === activePath) return;
    if (dirty && !window.confirm("You have unsaved changes. Open another file and discard them?")) return;
    setMessage(`Opening ${path}…`);
    try {
      const response = await fetch(`/api/staff/service-source?path=${encodeURIComponent(path)}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { document?: SourceDocument; error?: string };
      if (!response.ok || !body.document) throw new Error(body.error || "Could not open source file.");
      setDocument(body.document);
      setDraft(body.document.content);
      setActivePath(path);
      setTabs((current) => current.includes(path) ? current : [...current, path]);
      setMessage(`${path} opened.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open source file.");
    }
  }

  async function saveFile() {
    if (!document || !dirty || saving) return;
    if (!window.confirm(`Save changes to ${document.path}?\n\nA local backup will be created automatically first.`)) return;
    setSaving(true);
    setMessage(`Saving ${document.path}…`);
    try {
      const response = await fetch("/api/staff/service-source", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: document.path, content: draft, expectedHash: document.hash }),
      });
      const body = (await response.json().catch(() => ({}))) as { document?: SourceDocument; backupCreated?: boolean; error?: string };
      if (!response.ok || !body.document) throw new Error(body.error || "Could not save source file.");
      setDocument(body.document);
      setDraft(body.document.content);
      setFiles((current) => current.map((file) => file.path === body.document!.path ? body.document! : file));
      setMessage(`${body.document.path} saved to disk${body.backupCreated ? " — backup created" : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save source file.");
    } finally {
      setSaving(false);
    }
  }

  function closeTab(path: string) {
    if (path === activePath && dirty && !window.confirm("Discard the unsaved changes in this tab?")) return;
    const next = tabs.filter((item) => item !== path);
    setTabs(next);
    if (path === activePath) {
      const nextPath = next[next.length - 1] ?? "";
      setActivePath("");
      setDocument(null);
      setDraft("");
      if (nextPath) void openFile(nextPath, true);
    }
  }

  function editorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveFile();
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const next = `${draft.slice(0, start)}  ${draft.slice(end)}`;
      setDraft(next);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  }

  async function loadAccess() {
    if (!isMasterAdmin) return;
    setAccessBusy(true);
    try {
      const response = await fetch("/api/staff/service-access", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as AccessState & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load Service Settings access.");
      setAccess({ roles: body.roles ?? [], users: body.users ?? [] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Service Settings access.");
    } finally {
      setAccessBusy(false);
    }
  }

  async function changeAccess(targetType: "role" | "user", id: string, accessValue: "on" | "off" | "inherit") {
    if (!isMasterAdmin) return;
    setAccessBusy(true);
    try {
      const response = await fetch("/api/staff/service-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, id, access: accessValue }),
      });
      const body = (await response.json().catch(() => ({}))) as AccessState & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not update Service Settings access.");
      setAccess({ roles: body.roles ?? [], users: body.users ?? [] });
      setMessage("Service Settings access updated by Master Admin.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update Service Settings access.");
    } finally {
      setAccessBusy(false);
    }
  }

  useEffect(() => {
    void loadFiles(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (accessOpen && isMasterAdmin && !access) void loadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessOpen, isMasterAdmin]);

  return (
    <section className="service-workspace" aria-label="Service Settings source workspace">
      <div className="service-titlebar">
        <div className="service-window-actions" aria-hidden="true"><i /><i /><i /></div>
        <div className="service-title">British Airways Virtual — Service Settings</div>
        <div className="service-title-actions">
          {isMasterAdmin ? <button onClick={() => setAccessOpen((value) => !value)} className={accessOpen ? "active" : ""}>Access control</button> : null}
          <a href="/staff">Staff centre</a>
        </div>
      </div>

      <div className="service-main">
        <aside className="service-activity" aria-label="Workspace tools">
          <button className="active" title="Explorer">▱</button>
          <button onClick={() => setFilter("")} title="Search">⌕</button>
          {isMasterAdmin ? <button className={accessOpen ? "active" : ""} onClick={() => setAccessOpen((value) => !value)} title="Access control">♜</button> : null}
          <span />
          <button onClick={() => void loadFiles()} title="Refresh source files">↻</button>
        </aside>

        <aside className="service-explorer">
          <div className="service-sidebar-title"><strong>EXPLORER</strong><button onClick={() => void loadFiles()} disabled={loading}>↻</button></div>
          <div className="service-project-name">▾ VIRTUAL BRITISH AIRWAYS WEBSITE</div>
          <label className="service-file-filter"><span>⌕</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter files" /></label>
          <div className="service-file-tree">
            {folders.map(([folder, folderFiles]) => <div className="service-folder" key={folder}>
              <div className="service-folder-name">▾ <span>{folder}</span></div>
              {folderFiles.map((file) => <button key={file.path} className={file.path === activePath ? "active" : ""} onClick={() => void openFile(file.path)} title={file.path}>
                <span className="service-file-glyph">{fileGlyph(file.path)}</span><span>{fileName(file.path)}</span>
              </button>)}
            </div>)}
            {!loading && !filteredFiles.length ? <p className="service-empty">No source files match this filter.</p> : null}
          </div>
        </aside>

        <div className="service-editor-area">
          <div className="service-tabs">
            {tabs.map((path) => <div className={`service-tab ${path === activePath ? "active" : ""}`} key={path} onClick={() => void openFile(path)}>
              <span>{fileGlyph(path)}</span><b>{fileName(path)}</b>{path === activePath && dirty ? <em>●</em> : null}<button onClick={(event) => { event.stopPropagation(); closeTab(path); }}>×</button>
            </div>)}
          </div>
          <div className="service-breadcrumbs">{document ? document.path.split("/").map((part, index, array) => <span key={`${part}-${index}`}>{part}{index < array.length - 1 ? " ›" : ""}</span>) : <span>No file open</span>}</div>
          <div className="service-editor-toolbar">
            <span>{document ? document.language : "Source editor"}</span>
            <div>
              <button onClick={() => setWrap((value) => !value)} className={wrap ? "active" : ""}>Word wrap</button>
              <button onClick={() => document && void openFile(document.path, true)} disabled={!document || dirty}>Reload</button>
              <button className="save" onClick={() => void saveFile()} disabled={!document || !dirty || saving}>{saving ? "Saving…" : "Save  Ctrl+S"}</button>
            </div>
          </div>

          <div className="service-code-shell">
            {document ? <>
              <div className="service-line-numbers" aria-hidden="true">{Array.from({ length: lineCount(draft) }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
              <textarea
                className={`service-code-editor ${wrap ? "wrap" : ""}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={editorKeyDown}
                spellCheck={false}
                wrap={wrap ? "soft" : "off"}
                aria-label={`Editing ${document.path}`}
              />
            </> : <div className="service-welcome">
              <div className="service-ba-mark">BA<span>V</span></div>
              <h1>Service Settings</h1>
              <p>Select a project file from Explorer to inspect or edit the website source.</p>
              <small>Secrets, generated folders and binary assets are deliberately excluded.</small>
            </div>}
          </div>
        </div>

        {accessOpen && isMasterAdmin ? <aside className="service-access-panel">
          <header><div><strong>SOURCE ACCESS</strong><small>Master Admin only</small></div><button onClick={() => setAccessOpen(false)}>×</button></header>
          <p>Only you can grant or remove access to this source workspace. The option is invisible to all other permission managers.</p>
          <h3>Role access</h3>
          <div className="service-access-list">
            {access?.roles.map((role) => <label key={role.id}><span><b>{role.name}</b><small>{role.description}</small></span><input type="checkbox" checked={role.granted} disabled={accessBusy} onChange={(event) => void changeAccess("role", role.id, event.target.checked ? "on" : "off")} /></label>)}
          </div>
          <h3>Individual overrides</h3>
          <div className="service-user-access-list">
            {access?.users.map((user) => <div key={user.id}><span><b>{user.name}</b><small>{user.email}</small></span><select value={user.override === null ? "inherit" : user.override ? "on" : "off"} disabled={accessBusy || user.status !== "active"} onChange={(event) => void changeAccess("user", user.id, event.target.value as "on" | "off" | "inherit")}><option value="inherit">Role default</option><option value="on">Allow</option><option value="off">Deny</option></select><em className={user.effective ? "on" : "off"}>{user.effective ? "Access" : "No access"}</em></div>)}
          </div>
          {accessBusy ? <div className="service-access-loading">Updating access…</div> : null}
        </aside> : null}
      </div>

      <footer className="service-statusbar">
        <span>✓ Protected workspace</span>
        <span>{document ? `${document.language} · ${formatBytes(utf8Size(draft))}` : "No file selected"}</span>
        <span>{dirty ? "● Unsaved changes" : "Saved"}</span>
        <span>{staffName}{isMasterAdmin ? " · Master Admin" : ""}</span>
        <span className="service-status-message">{message}</span>
      </footer>
    </section>
  );
}
