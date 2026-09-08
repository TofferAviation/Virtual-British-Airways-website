"use client";

import { useMemo, useState } from "react";
import { newsCategoryLabels, type NewsArticle, type NewsCategoryId } from "@/data/news";

type Props = {
  initialArticles: NewsArticle[];
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

export function NewsManager({ initialArticles, canCreate, canEdit, canPublish, canDelete }: Props) {
  const [articles, setArticles] = useState(initialArticles);
  const [draft, setDraft] = useState<NewsArticle | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "drafts">("all");

  const visible = useMemo(() => articles.filter((article) => filter === "all" || (filter === "published" ? article.published : !article.published)), [articles, filter]);
  const publishedCount = articles.filter((article) => article.published).length;
  const draftCount = articles.length - publishedCount;

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
        <div><span>Featured</span><strong>{articles.filter((item) => item.featured && item.published).length}</strong><small>hero candidates</small></div>
      </section>

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
              <label className="wide"><span>Image URL</span><input value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })} placeholder="https://… or /branding/news-image.jpg" /></label>
              <label><span>Image position</span><input value={draft.imagePosition ?? ""} onChange={(event) => setDraft({ ...draft, imagePosition: event.target.value })} placeholder="center center" /></label>
              <label><span>Author</span><input value={draft.author ?? ""} onChange={(event) => setDraft({ ...draft, author: event.target.value })} /></label>
            </div>
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
