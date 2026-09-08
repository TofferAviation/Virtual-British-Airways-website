import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { newsCategoryLabels } from "@/data/news";
import { getNewsArticles } from "@/lib/news-store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = (await getNewsArticles()).find((item) => item.slug === slug && item.published);
  return article ? { title: article.title, description: article.excerpt } : { title: "News update" };
}

export default async function NewsArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = (await getNewsArticles()).find((item) => item.slug === slug && item.published);
  if (!article) notFound();

  return (
    <>
      <SiteHeader />
      <main className="news-article-page">
        <div className="news-breadcrumb-band"><div className="news-shell news-breadcrumbs"><Link href="/">Home</Link><span>›</span><Link href="/news">News & announcements</Link><span>›</span><strong>{article.title}</strong></div></div>
        <article className="news-shell news-article">
          <header>
            <span className="news-card-kicker">{newsCategoryLabels[article.category]}</span>
            <h1>{article.title}</h1>
            <p>{article.excerpt}</p>
            <div><time>{formatDate(article.date)}</time>{article.author ? <span>{article.author}</span> : null}</div>
          </header>
          {article.image ? <div className="news-article-hero"><img src={article.image} alt="" style={{ objectPosition: article.imagePosition ?? "center center" }} /></div> : null}
          <div className="news-article-body">{article.body.split(/\n\n+/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
          <footer><Link href="/news">← Back to News & announcements</Link><Link href="/service-status">Service status →</Link></footer>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
