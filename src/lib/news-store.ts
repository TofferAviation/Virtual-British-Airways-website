import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { seedNewsArticles, type NewsArticle } from "@/data/news";

const dataDir = path.join(process.cwd(), ".bav-data");
const newsFile = path.join(dataDir, "news.json");

function sortNews(items: NewsArticle[]) {
  return [...items].sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));
}

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

export async function getNewsArticles(): Promise<NewsArticle[]> {
  try {
    const raw = await readFile(newsFile, "utf8");
    const parsed = JSON.parse(raw) as NewsArticle[];
    if (!Array.isArray(parsed)) return sortNews(seedNewsArticles);
    return sortNews(parsed);
  } catch {
    return sortNews(seedNewsArticles);
  }
}

export async function saveNewsArticles(items: NewsArticle[]) {
  await ensureDataDir();
  const tmp = `${newsFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify(sortNews(items), null, 2)}\n`, "utf8");
  await rename(tmp, newsFile);
}

export async function createNewsArticle(article: NewsArticle) {
  const items = await getNewsArticles();
  if (items.some((item) => item.id === article.id || item.slug === article.slug)) {
    throw new Error("A news article with this id or URL slug already exists.");
  }
  items.push(article);
  await saveNewsArticles(items);
  return article;
}

export async function updateNewsArticle(id: string, article: NewsArticle) {
  const items = await getNewsArticles();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("News article not found.");
  if (items.some((item) => item.id !== id && item.slug === article.slug)) {
    throw new Error("Another news article already uses that URL slug.");
  }
  items[index] = { ...article, id };
  await saveNewsArticles(items);
  return items[index];
}

export async function deleteNewsArticle(id: string) {
  const items = await getNewsArticles();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) throw new Error("News article not found.");
  await saveNewsArticles(next);
}

export function slugifyNewsTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}
