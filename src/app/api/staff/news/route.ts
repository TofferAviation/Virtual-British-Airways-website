import { NextRequest, NextResponse } from "next/server";
import { newsCategoryLabels, type NewsArticle, type NewsCategoryId } from "@/data/news";
import { createNewsArticle, deleteNewsArticle, getNewsArticles, slugifyNewsTitle, updateNewsArticle } from "@/lib/news-store";
import type { PermissionId } from "@/lib/permissions";
import { getStaffSession } from "@/lib/staff-auth";
import { addAudit, getStaffState, hasPermission, saveStaffState } from "@/lib/staff-store";

const categories = Object.keys(newsCategoryLabels) as NewsCategoryId[];

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

async function authorize(permission: PermissionId) {
  const session = await getStaffSession();
  if (!session) return { denied: NextResponse.json({ error: "Staff authentication required." }, { status: 401 }) };
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor || !hasPermission(state, actor, permission)) {
    return { denied: NextResponse.json({ error: `Permission required: ${permission}.` }, { status: 403 }) };
  }
  return { session, state, actor };
}

function normalizeArticle(input: unknown, existingId?: string): NewsArticle {
  if (!input || typeof input !== "object") throw new Error("Invalid news article payload.");
  const raw = input as Record<string, unknown>;
  const title = text(raw.title);
  const category = categories.includes(raw.category as NewsCategoryId) ? raw.category as NewsCategoryId : "community";
  const date = text(raw.date);
  const excerpt = text(raw.excerpt);
  const body = text(raw.body);
  if (!title || !date || !excerpt || !body) throw new Error("Title, date, summary and article body are required.");
  const slug = text(raw.slug) || slugifyNewsTitle(title);
  const id = existingId || text(raw.id) || `news-${slug}-${date}`;
  return {
    id,
    slug,
    title,
    category,
    excerpt,
    body,
    date,
    image: text(raw.image),
    imagePosition: text(raw.imagePosition) || undefined,
    featured: bool(raw.featured),
    published: bool(raw.published),
    author: text(raw.author) || undefined,
  };
}

async function ensurePublishPermission(article: NewsArticle, state: Awaited<ReturnType<typeof getStaffState>>, actor: NonNullable<Awaited<ReturnType<typeof getStaffState>>["users"][number]>) {
  if (article.published && !hasPermission(state, actor, "news.publish")) {
    throw new Error("Permission required: news.publish.");
  }
}

export async function GET() {
  const auth = await authorize("news.view");
  if ("denied" in auth) return auth.denied;
  return NextResponse.json({ articles: await getNewsArticles() });
}

export async function POST(request: NextRequest) {
  const auth = await authorize("news.create");
  if ("denied" in auth) return auth.denied;
  try {
    const body = await request.json() as { article?: unknown };
    const article = normalizeArticle(body.article);
    await ensurePublishPermission(article, auth.state, auth.actor);
    const created = await createNewsArticle(article);
    addAudit(auth.state, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "news.created",
      details: `Created news article “${created.title}”${created.published ? " and published it" : " as a draft"}.`,
    });
    await saveStaffState(auth.state);
    return NextResponse.json({ article: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create news article." }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await authorize("news.edit");
  if ("denied" in auth) return auth.denied;
  try {
    const body = await request.json() as { id?: string; article?: unknown };
    const id = text(body.id);
    if (!id) throw new Error("News article id is required.");
    const article = normalizeArticle(body.article, id);
    await ensurePublishPermission(article, auth.state, auth.actor);
    const updated = await updateNewsArticle(id, article);
    addAudit(auth.state, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "news.updated",
      details: `Updated news article “${updated.title}”${updated.published ? " and left it published" : " as a draft"}.`,
    });
    await saveStaffState(auth.state);
    return NextResponse.json({ article: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update news article." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize("news.delete");
  if ("denied" in auth) return auth.denied;
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) throw new Error("News article id is required.");
    const existing = (await getNewsArticles()).find((item) => item.id === id);
    await deleteNewsArticle(id);
    addAudit(auth.state, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "news.deleted",
      details: `Deleted news article “${existing?.title ?? id}”.`,
    });
    await saveStaffState(auth.state);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete news article." }, { status: 400 });
  }
}
