"use client";

import { useMemo, useState } from "react";
import { newsCategoryLabels, type NewsArticle, type NewsCategoryId } from "@/data/news";
import type { NewsMainSection, NewsPageSettings, NewsSidebarSection } from "@/lib/news-page-store";

type Props = {
  initialArticles: NewsArticle[];
  initialPageSettings: NewsPageSettings;
  canCreate: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function blankArticle(): NewsArticle {
  return {
    id: "",
    slug: "",
    title: "",
    category: "community",
    excerpt: "",
    body: "",
    date: today(),
    image: "",
    imagePosition: "center center",
    featured: false,
    published: false,
    author: "British Airways Virtual",
  };
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

const mainSectionLabels: Record<NewsMainSection, string> = {
  featured: "Featured story",
  secondary: "Three story cards",
  latest: "Latest news row",
};

const sidebarSectionLabels: Record<NewsSidebarSection, string> = {
  announcements: "Service announcements",
  "quick-links": "Quick links",
  promo: "Promotional panel",
};

export function NewsManager({ initialArticles, initialPageSettings, canCreate, canEdit, canPublish, canDelete }: Props) {
  const [articles, setArticles] = useState(initialArticles);
  const [pageSettings, setPageSettings] = useState(initialPageSettings);
  const [draft, setDraft] = useState<NewsArticle | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "drafts">("all");
  const [workspace, setWorkspace] = useState<"page" | "stories">("page");

  const visible = useMemo(() => articles.filter((article) => filter === "all" || (filter === "published" ? article.published : !article.published)), [articles, filter]);
  const publishedCount = articles.filter((article) => article.published).length;
  const draftCount = articles.length - publishedCount;

  async function uploadImage(file: File, apply: (url: string) => void) {
    if (!canEdit) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/staff/news-media", { method: "POST", body: form });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Could not upload image.");
      apply(body.url);
      setMessage("Image uploaded. Save the page or article to publish the new selection.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not upload image.");
    } finally {
      setBusy(false);
    }
  }

  async function savePageSettings() {
    if (!canEdit) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/staff/news-page", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: pageSettings }),
      });
      const body = await response.json() as { settings?: NewsPageSettings; error?: string };
      if (!response.ok || !body.settings) throw new Error(body.error || "Could not save newsroom page.");
      setPageSettings(body.settings);
      setMessage("Newsroom page layout saved and published.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save newsroom page.");
    } finally {
      setBusy(false);
    }
  }

  async function saveArticle() {
    if (!draft) return;
    setBusy(true);
    setMessage("");
    try {
      const isNew = !draft.id;
      const response = await fetch("/api/staff/news", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? { article: draft } : { id: draft.id, article: draft }),
      });
      const body = await response.json() as { article?: NewsArticle; error?: string };
      if (!response.ok || !body.article) throw new Error(body.error || "Could not save news article.");
      setArticles((current) => isNew ? [body.article!, ...current] : current.map((item) => item.id === body.article!.id ? body.article! : item));
      setDraft(null);
      setMessage(body.article.published ? "News article saved and published." : "News article saved as a draft.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save news article.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteArticle() {
    if (!draft?.id || !canDelete || !window.confirm(`Delete “${draft.title}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/staff/news?id=${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not delete news article.");
      setArticles((current) => current.filter((item) => item.id !== draft.id));
      setDraft(null);
      setMessage("News article deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete news article.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message ? <div className="news-admin-message" role="status">{message}<button onClick={() => setMessage("")}>×</button></div> : null}

      <section className="news-admin-overview">
        <div><span>Published</span><strong>{publishedCount}</strong><small>visible on the public newsroom</small></div>
        <div><span>Drafts</span><strong>{draftCount}</strong><small>waiting for publication</small></div>
        <div><span>Total stories</span><strong>{articles.length}</strong><small>newsroom records</small></div>
        <div><span>Page builder</span><strong>{canEdit ? "Live" : "View"}</strong><small>hero, sections, links and imagery</small></div>
      </section>

      <div className="news-admin-workspace-tabs">
        <button className={workspace === "page" ? "active" : ""} onClick={() => setWorkspace("page")}>Page builder</button>
        <button className={workspace === "stories" ? "active" : ""} onClick={() => setWorkspace("stories")}>Stories & announcements</button>
        <a href="/news" target="_blank" rel="noreferrer">Live preview ↗</a>
      </div>

      {workspace === "page" ? (
        <div className="news-builder-grid">
          <section className="news-admin-panel news-builder-panel">
            <div className="news-admin-panel-heading"><div><span className="staff-kicker">Page settings</span><h2>Hero & presentation</h2><p>Use a finished banner exactly as supplied, or switch to an editable hero when you want to experiment.</p></div></div>
            <div className="news-builder-form">
              <label><span>Hero layout</span><select disabled={!canEdit} value={pageSettings.heroMode} onChange={(event) => setPageSettings({ ...pageSettings, heroMode: event.target.value as NewsPageSettings["heroMode"] })}><option value="image">Finished banner image</option><option value="editable">Editable BA-style hero</option></select></label>
              <label className="wide"><span>Hero image</span><div className="news-builder-upload-row"><input disabled={!canEdit} value={pageSettings.heroImage} onChange={(event) => setPageSettings({ ...pageSettings, heroImage: event.target.value })} /><label className={`news-admin-primary news-upload-button ${!canEdit ? "disabled" : ""}`}>Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={!canEdit || busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, (url) => setPageSettings((current) => ({ ...current, heroImage: url }))); event.currentTarget.value = ""; }} /></label></div></label>
              <label><span>Image position</span><input disabled={!canEdit} value={pageSettings.heroImagePosition} onChange={(event) => setPageSettings({ ...pageSettings, heroImagePosition: event.target.value })} placeholder="center center" /></label>
              {pageSettings.heroMode === "editable" ? <>
                <label><span>Eyebrow</span><input disabled={!canEdit} value={pageSettings.heroKicker} onChange={(event) => setPageSettings({ ...pageSettings, heroKicker: event.target.value })} /></label>
                <label className="wide"><span>Hero title</span><input disabled={!canEdit} value={pageSettings.heroTitle} onChange={(event) => setPageSettings({ ...pageSettings, heroTitle: event.target.value })} /></label>
                <label className="wide"><span>Description</span><textarea disabled={!canEdit} rows={3} value={pageSettings.heroDescription} onChange={(event) => setPageSettings({ ...pageSettings, heroDescription: event.target.value })} /></label>
                <label><span>Right-side heading</span><input disabled={!canEdit} value={pageSettings.heroSideTitle} onChange={(event) => setPageSettings({ ...pageSettings, heroSideTitle: event.target.value })} /></label>
                <label><span>Right-side text</span><input disabled={!canEdit} value={pageSettings.heroSideText} onChange={(event) => setPageSettings({ ...pageSettings, heroSideText: event.target.value })} /></label>
                <label className="wide"><span>Tagline</span><input disabled={!canEdit} value={pageSettings.heroTagline} onChange={(event) => setPageSettings({ ...pageSettings, heroTagline: event.target.value })} /></label>
              </> : null}
              <label><span>Featured story</span><select disabled={!canEdit} value={pageSettings.featuredArticleId} onChange={(event) => setPageSettings({ ...pageSettings, featuredArticleId: event.target.value })}><option value="">Automatic / article flag</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}</select></label>
            </div>
            {pageSettings.heroImage ? <div className="news-builder-preview"><img src={pageSettings.heroImage} alt="Hero preview" style={{ objectPosition: pageSettings.heroImagePosition }} /></div> : null}
          </section>

          <section className="news-admin-panel news-builder-panel">
            <div className="news-admin-panel-heading"><div><span className="staff-kicker">Layout builder</span><h2>Arrange the newsroom</h2><p>Show, hide and reorder the major blocks without changing source code.</p></div></div>
            <div className="news-builder-section-group"><h3>Main column</h3>{pageSettings.mainSections.map((section, index) => <div className="news-builder-section-row" key={section}><label><input type="checkbox" disabled={!canEdit} checked={pageSettings.visibility[section]} onChange={(event) => setPageSettings({ ...pageSettings, visibility: { ...pageSettings.visibility, [section]: event.target.checked } })} /><span>{mainSectionLabels[section]}</span></label><div><button disabled={!canEdit || index === 0} onClick={() => setPageSettings({ ...pageSettings, mainSections: moveItem(pageSettings.mainSections, index, -1) })}>↑</button><button disabled={!canEdit || index === pageSettings.mainSections.length - 1} onClick={() => setPageSettings({ ...pageSettings, mainSections: moveItem(pageSettings.mainSections, index, 1) })}>↓</button></div></div>)}</div>
            <div className="news-builder-section-group"><h3>Sidebar</h3>{pageSettings.sidebarSections.map((section, index) => <div className="news-builder-section-row" key={section}><label><input type="checkbox" disabled={!canEdit} checked={pageSettings.visibility[section]} onChange={(event) => setPageSettings({ ...pageSettings, visibility: { ...pageSettings.visibility, [section]: event.target.checked } })} /><span>{sidebarSectionLabels[section]}</span></label><div><button disabled={!canEdit || index === 0} onClick={() => setPageSettings({ ...pageSettings, sidebarSections: moveItem(pageSettings.sidebarSections, index, -1) })}>↑</button><button disabled={!canEdit || index === pageSettings.sidebarSections.length - 1} onClick={() => setPageSettings({ ...pageSettings, sidebarSections: moveItem(pageSettings.sidebarSections, index, 1) })}>↓</button></div></div>)}</div>
          </section>

          <section className="news-admin-panel news-builder-panel">
            <div className="news-admin-panel-heading"><div><span className="staff-kicker">Navigation</span><h2>Section labels</h2><p>Change the public newsroom tab names while preserving their destinations.</p></div></div>
            <div className="news-builder-form compact">{Object.entries(pageSettings.navLabels).map(([key, value]) => <label key={key}><span>{key.replace(/-/g, " ")}</span><input disabled={!canEdit} value={value} onChange={(event) => setPageSettings({ ...pageSettings, navLabels: { ...pageSettings.navLabels, [key]: event.target.value } })} /></label>)}</div>
          </section>

          <section className="news-admin-panel news-builder-panel">
            <div className="news-admin-panel-heading"><div><span className="staff-kicker">Sidebar</span><h2>Quick links</h2><p>Edit the destinations shown beside newsroom content.</p></div></div>
            <div className="news-builder-links">{pageSettings.quickLinks.map((link, index) => <div className="news-builder-link" key={link.id}><input disabled={!canEdit} aria-label="Icon" value={link.icon} onChange={(event) => setPageSettings({ ...pageSettings, quickLinks: pageSettings.quickLinks.map((item, itemIndex) => itemIndex === index ? { ...item, icon: event.target.value } : item) })} /><input disabled={!canEdit} aria-label="Label" value={link.label} onChange={(event) => setPageSettings({ ...pageSettings, quickLinks: pageSettings.quickLinks.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /><input disabled={!canEdit} aria-label="Description" value={link.description} onChange={(event) => setPageSettings({ ...pageSettings, quickLinks: pageSettings.quickLinks.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })} /><input disabled={!canEdit} aria-label="URL" value={link.href} onChange={(event) => setPageSettings({ ...pageSettings, quickLinks: pageSettings.quickLinks.map((item, itemIndex) => itemIndex === index ? { ...item, href: event.target.value } : item) })} /><button disabled={!canEdit || pageSettings.quickLinks.length <= 1} onClick={() => setPageSettings({ ...pageSettings, quickLinks: pageSettings.quickLinks.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>)}<button className="news-admin-secondary" disabled={!canEdit || pageSettings.quickLinks.length >= 8} onClick={() => setPageSettings({ ...pageSettings, quickLinks: [...pageSettings.quickLinks, { id: `link-${Date.now()}`, label: "New link", description: "Description", href: "/", icon: "›" }] })}>Add quick link +</button></div>
          </section>

          <section className="news-admin-panel news-builder-panel news-builder-promo-panel">
            <div className="news-admin-panel-heading"><div><span className="staff-kicker">Sidebar</span><h2>Promotional panel</h2><p>Change the image and message used at the bottom of the newsroom sidebar.</p></div></div>
            <div className="news-builder-form"><label className="wide"><span>Message</span><textarea disabled={!canEdit} rows={3} value={pageSettings.promoTitle} onChange={(event) => setPageSettings({ ...pageSettings, promoTitle: event.target.value })} /></label><label className="wide"><span>Image</span><div className="news-builder-upload-row"><input disabled={!canEdit} value={pageSettings.promoImage} onChange={(event) => setPageSettings({ ...pageSettings, promoImage: event.target.value })} /><label className={`news-admin-primary news-upload-button ${!canEdit ? "disabled" : ""}`}>Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={!canEdit || busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, (url) => setPageSettings((current) => ({ ...current, promoImage: url }))); event.currentTarget.value = ""; }} /></label></div></label><label><span>Image position</span><input disabled={!canEdit} value={pageSettings.promoImagePosition} onChange={(event) => setPageSettings({ ...pageSettings, promoImagePosition: event.target.value })} /></label></div>
          </section>

          <div className="news-builder-savebar"><div><strong>Structured page builder</strong><span>Changes stay local to the News & Announcements page and can be adjusted again at any time.</span></div><div><a className="news-admin-secondary" href="/news" target="_blank" rel="noreferrer">Preview live ↗</a><button className="news-admin-primary" disabled={!canEdit || busy} onClick={() => void savePageSettings()}>{busy ? "Saving…" : "Save page changes"}</button></div></div>
        </div>
      ) : (
        <section className="news-admin-panel">
          <div className="news-admin-panel-heading">
            <div><span className="staff-kicker">Newsroom content</span><h2>News & announcements</h2><p>Create, edit, publish and remove the stories shown on the public What&apos;s New page.</p></div>
            <div className="news-admin-heading-actions">
              <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All stories</option><option value="published">Published</option><option value="drafts">Drafts</option></select>
              {canCreate ? <button className="news-admin-primary" onClick={() => setDraft(blankArticle())}>Create story +</button> : null}
            </div>
          </div>

          <div className="news-admin-table-wrap">
            <table className="news-admin-table">
              <thead><tr><th>Date</th><th>Story</th><th>Category</th><th>Status</th><th>Featured</th><th>Action</th></tr></thead>
              <tbody>
                {visible.map((article) => <tr key={article.id}>
                  <td>{formatDate(article.date)}</td>
                  <td><strong>{article.title}</strong><small>{article.excerpt}</small></td>
                  <td>{newsCategoryLabels[article.category]}</td>
                  <td><span className={`news-admin-status ${article.published ? "published" : "draft"}`}>{article.published ? "Published" : "Draft"}</span></td>
                  <td>{article.featured ? "Yes" : "—"}</td>
                  <td><button className="news-admin-edit" disabled={!canEdit} onClick={() => setDraft(article)}>Edit →</button></td>
                </tr>)}
                {!visible.length ? <tr><td colSpan={6} className="news-admin-empty">No stories match this filter.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {draft ? (
        <div className="news-admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDraft(null); }}>
          <section className="news-admin-modal" role="dialog" aria-modal="true" aria-label={draft.id ? "Edit news article" : "Create news article"}>
            <header><div><span className="staff-kicker">News editor</span><h2>{draft.id ? "Edit story" : "Create story"}</h2></div><button onClick={() => setDraft(null)} disabled={busy}>×</button></header>
            <div className="news-admin-form-grid">
              <label className="wide"><span>Headline</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label><span>Category</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as NewsCategoryId })}>{Object.entries(newsCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>Publication date</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
              <label className="wide"><span>Summary</span><textarea rows={3} value={draft.excerpt} onChange={(event) => setDraft({ ...draft, excerpt: event.target.value })} /></label>
              <label className="wide"><span>Article body</span><textarea rows={9} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="Use a blank line between paragraphs." /></label>
              <label className="wide"><span>Article image</span><div className="news-builder-upload-row"><input value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })} placeholder="https://… or /uploads/news/image.jpg" /><label className={`news-admin-primary news-upload-button ${!canEdit ? "disabled" : ""}`}>Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={!canEdit || busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, (url) => setDraft((current) => current ? { ...current, image: url } : current)); event.currentTarget.value = ""; }} /></label></div></label>
              <label><span>Image position</span><input value={draft.imagePosition ?? ""} onChange={(event) => setDraft({ ...draft, imagePosition: event.target.value })} placeholder="center center" /></label>
              <label><span>Author</span><input value={draft.author ?? ""} onChange={(event) => setDraft({ ...draft, author: event.target.value })} /></label>
            </div>
            {draft.image ? <div className="news-article-image-preview"><img src={draft.image} alt="Article preview" style={{ objectPosition: draft.imagePosition ?? "center center" }} /></div> : null}
            <div className="news-admin-checks">
              <label><input type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} /> Featured story</label>
              <label className={!canPublish ? "disabled" : ""}><input type="checkbox" disabled={!canPublish} checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })} /> Published on What&apos;s New</label>
            </div>
            {!canPublish ? <p className="news-admin-permission-note">You can edit newsroom content, but publishing requires the News & announcements → Publish news permission.</p> : null}
            <footer>
              <div>{draft.id && canDelete ? <button className="news-admin-danger" onClick={() => void deleteArticle()} disabled={busy}>Delete story</button> : null}</div>
              <div><button className="news-admin-secondary" onClick={() => setDraft(null)} disabled={busy}>Cancel</button><button className="news-admin-primary" onClick={() => void saveArticle()} disabled={busy || (!draft.id && !canCreate) || (Boolean(draft.id) && !canEdit)}>{busy ? "Saving…" : draft.published ? "Save & publish" : "Save draft"}</button></div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
