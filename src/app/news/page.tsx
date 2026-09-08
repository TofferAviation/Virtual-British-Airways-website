import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { newsCategoryLabels, type NewsArticle } from "@/data/news";
import { getNewsArticles } from "@/lib/news-store";
import { getServiceStatusState, incidentStageLabel } from "@/lib/service-status-store";
import { getStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News & announcements",
  description: "The latest British Airways Virtual news, service announcements, route releases, events and community updates.",
};

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatIsoDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function articleHref(article: NewsArticle) {
  return `/news/${article.slug}`;
}

export default async function NewsPage() {
  const [allArticles, statusState, staffSession] = await Promise.all([
    getNewsArticles(),
    getServiceStatusState(),
    getStaffSession(),
  ]);

  const articles = allArticles.filter((article) => article.published);
  const featured = articles.find((article) => article.featured) ?? articles[0];
  const secondary = articles.filter((article) => article.id !== featured?.id).slice(0, 3);
  const latest = articles.filter((article) => article.id !== featured?.id && !secondary.some((item) => item.id === article.id)).slice(0, 4);

  const statusAnnouncements: Array<{ title: string; excerpt: string; date: string; tone: "green" | "amber" | "red" }> = [];
  for (const item of statusState.maintenance.filter((maintenance) => maintenance.status === "scheduled").slice(0, 2)) {
    statusAnnouncements.push({ title: item.title, excerpt: item.message, date: formatIsoDate(item.startAt), tone: "amber" });
  }
  for (const incident of statusState.incidents.filter((item) => item.stage !== "resolved").slice(0, 2)) {
    statusAnnouncements.push({
      title: incident.title,
      excerpt: incident.updates[0]?.message ?? incidentStageLabel(incident.stage),
      date: formatIsoDate(incident.updatedAt),
      tone: incident.stage === "investigating" ? "amber" : "red",
    });
  }
  for (const incident of statusState.incidents.filter((item) => item.stage === "resolved").slice(0, 1)) {
    statusAnnouncements.push({
      title: incident.title,
      excerpt: incident.updates[0]?.message ?? "This incident has been resolved.",
      date: formatIsoDate(incident.updatedAt),
      tone: "green",
    });
  }
  if (statusAnnouncements.length < 3) {
    for (const article of articles.filter((item) => item.category === "announcement")) {
      if (statusAnnouncements.length >= 3) break;
      statusAnnouncements.push({ title: article.title, excerpt: article.excerpt, date: formatDate(article.date), tone: "green" });
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="news-page">
        <div className="news-breadcrumb-band">
          <div className="news-shell news-breadcrumbs"><Link href="/">Home</Link><span>›</span><span>British Airways Virtual</span><span>›</span><strong>News & announcements</strong></div>
        </div>

        <section className="news-hero">
          <div className="news-shell news-hero-inner">
            <div className="news-hero-copy">
              <span className="news-kicker">Newsroom</span>
              <h1>News & announcements</h1>
              <i />
              <p>The latest virtual airline updates, service announcements, event news, route releases and community information from British Airways Virtual.</p>
            </div>
            <div className="news-hero-latest">
              <strong>Latest update</strong>
              <span>Stay informed<br />across the network.</span>
              <i />
              <small>A global community<br />A brighter tomorrow</small>
            </div>
            <div className="news-hero-network" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
            <div className="news-hero-tag" aria-hidden="true">People<br />Routes<br />Community<br />Opportunity</div>
          </div>
        </section>

        <nav className="news-section-nav" aria-label="News sections">
          <div className="news-shell"><a className="active" href="#overview">Overview</a><a href="#latest">Latest news</a><a href="#announcements">Announcements</a><a href="#operations">Operations updates</a><a href="#community">Community</a></div>
        </nav>

        <div className="news-shell news-layout" id="overview">
          <div className="news-main-column">
            {featured ? (
              <article className="news-featured-card">
                <div className="news-featured-image"><img src={featured.image} alt="" style={{ objectPosition: featured.imagePosition ?? "center center" }} /></div>
                <div className="news-featured-copy">
                  <span className="news-card-kicker">{newsCategoryLabels[featured.category]}</span>
                  <h2>{featured.title}</h2>
                  <p>{featured.excerpt}</p>
                  <div><time>▣&nbsp; {formatDate(featured.date)}</time><Link className="news-read-button" href={articleHref(featured)}>Read update <span>→</span></Link></div>
                </div>
              </article>
            ) : <div className="news-empty">No published news yet.</div>}

            <section className="news-secondary-grid" id="community">
              {secondary.map((article) => (
                <article className="news-secondary-card" key={article.id}>
                  <Link className="news-card-image" href={articleHref(article)}><img src={article.image} alt="" style={{ objectPosition: article.imagePosition ?? "center center" }} /></Link>
                  <div className="news-card-copy"><span className="news-card-kicker">{newsCategoryLabels[article.category]}</span><h3><Link href={articleHref(article)}>{article.title}</Link></h3><p>{article.excerpt}</p><footer><time>▣&nbsp; {formatDate(article.date)}</time><Link href={articleHref(article)}>→</Link></footer></div>
                </article>
              ))}
            </section>

            <section className="news-latest-panel" id="latest">
              <div className="news-panel-heading"><h2>Latest news</h2><a href="#overview">View all news →</a></div>
              <div className="news-latest-grid">
                {latest.map((article) => (
                  <article key={article.id}>
                    <Link className="news-latest-image" href={articleHref(article)}><img src={article.image} alt="" /></Link>
                    <span className="news-card-kicker">{newsCategoryLabels[article.category]}</span>
                    <h3><Link href={articleHref(article)}>{article.title}</Link></h3>
                    <p>{article.excerpt}</p>
                    <time>▣&nbsp; {formatDate(article.date)}</time>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="news-sidebar">
            <section className="news-side-card" id="announcements">
              <div className="news-side-heading"><span>⚑</span><h2>Service announcements</h2><Link href="/service-status">View all →</Link></div>
              <div className="news-announcement-list">
                {statusAnnouncements.slice(0, 3).map((item, index) => <article key={`${item.title}-${index}`}><i className={item.tone} /><div><strong>{item.title}</strong><p>{item.excerpt}</p></div><time>{item.date}</time></article>)}
                {!statusAnnouncements.length ? <p className="news-side-empty">No active service announcements.</p> : null}
              </div>
            </section>

            <section className="news-side-card" id="operations">
              <div className="news-side-heading"><span>↗</span><h2>Quick links</h2></div>
              <div className="news-quick-links">
                <Link href="/help"><span>?</span><div><b>Help centre</b><small>Guides, FAQs and support</small></div><i>›</i></Link>
                <Link href="/service-status"><span>◷</span><div><b>System status</b><small>Live service information</small></div><i>›</i></Link>
                <Link href="/events"><span>▣</span><div><b>Events</b><small>View upcoming community events</small></div><i>›</i></Link>
                <Link href="/va-points"><span>◇</span><div><b>VA Points</b><small>Your balance and programme details</small></div><i>›</i></Link>
                {staffSession ? <Link href="/staff/news"><span>♟</span><div><b>Staff notices</b><small>Publish and manage newsroom content</small></div><i>›</i></Link> : <Link href="/about"><span>♟</span><div><b>About the VA</b><small>Learn more about our community</small></div><i>›</i></Link>}
              </div>
            </section>

            <section className="news-promo-card">
              <div><strong>More than a simulation.<br />A global community.</strong><i /></div>
              <img src="/branding/ba-virtual-logo-white.svg" alt="British Airways Virtual" />
            </section>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
