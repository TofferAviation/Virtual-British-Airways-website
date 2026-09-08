import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { newsCategoryLabels, type NewsArticle } from "@/data/news";
import { getNewsPageSettings, type NewsMainSection, type NewsSidebarSection } from "@/lib/news-page-store";
import { getNewsArticles } from "@/lib/news-store";
import { getServiceStatusState, incidentStageLabel } from "@/lib/service-status-store";

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
  const [allArticles, statusState, settings] = await Promise.all([
    getNewsArticles(),
    getServiceStatusState(),
    getNewsPageSettings(),
  ]);

  const articles = allArticles.filter((article) => article.published);
  const featured = articles.find((article) => article.id === settings.featuredArticleId)
    ?? articles.find((article) => article.featured)
    ?? articles[0];
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

  function renderMain(section: NewsMainSection) {
    if (!settings.visibility[section]) return null;
    if (section === "featured") {
      return featured ? (
        <article className="news-featured-card" key="featured">
          <div className="news-featured-image"><img src={featured.image} alt="" style={{ objectPosition: featured.imagePosition ?? "center center" }} /></div>
          <div className="news-featured-copy">
            <span className="news-card-kicker">{newsCategoryLabels[featured.category]}</span>
            <h2>{featured.title}</h2>
            <p>{featured.excerpt}</p>
            <div><time>▣&nbsp; {formatDate(featured.date)}</time><Link className="news-read-button" href={articleHref(featured)}>Read update <span>→</span></Link></div>
          </div>
        </article>
      ) : <div className="news-empty" key="featured-empty">No published news yet.</div>;
    }
    if (section === "secondary") {
      return (
        <section className="news-secondary-grid" id="community" key="secondary">
          {secondary.map((article) => (
            <article className="news-secondary-card" key={article.id}>
              <Link className="news-card-image" href={articleHref(article)}><img src={article.image} alt="" style={{ objectPosition: article.imagePosition ?? "center center" }} /></Link>
              <div className="news-card-copy"><span className="news-card-kicker">{newsCategoryLabels[article.category]}</span><h3><Link href={articleHref(article)}>{article.title}</Link></h3><p>{article.excerpt}</p><footer><time>▣&nbsp; {formatDate(article.date)}</time><Link href={articleHref(article)}>→</Link></footer></div>
            </article>
          ))}
        </section>
      );
    }
    return (
      <section className="news-latest-panel" id="latest" key="latest">
        <div className="news-panel-heading"><h2>{settings.navLabels.latest}</h2><a href="#overview">View all news →</a></div>
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
    );
  }

  function renderSidebar(section: NewsSidebarSection) {
    if (!settings.visibility[section]) return null;
    if (section === "announcements") {
      return (
        <section className="news-side-card" id="announcements" key="announcements">
          <div className="news-side-heading"><span>⚑</span><h2>Service announcements</h2><Link href="/service-status">View all →</Link></div>
          <div className="news-announcement-list">
            {statusAnnouncements.slice(0, 3).map((item, index) => <article key={`${item.title}-${index}`}><i className={item.tone} /><div><strong>{item.title}</strong><p>{item.excerpt}</p></div><time>{item.date}</time></article>)}
            {!statusAnnouncements.length ? <p className="news-side-empty">No active service announcements.</p> : null}
          </div>
        </section>
      );
    }
    if (section === "quick-links") {
      return (
        <section className="news-side-card" id="operations" key="quick-links">
          <div className="news-side-heading"><span>↗</span><h2>Quick links</h2></div>
          <div className="news-quick-links">
            {settings.quickLinks.map((item) => <Link href={item.href} key={item.id}><span>{item.icon}</span><div><b>{item.label}</b><small>{item.description}</small></div><i>›</i></Link>)}
          </div>
        </section>
      );
    }
    return (
      <section className="news-promo-card" key="promo" style={{ backgroundImage: `linear-gradient(90deg,rgba(4,25,57,.96),rgba(4,25,57,.58)),url("${settings.promoImage}")`, backgroundPosition: settings.promoImagePosition }}>
        <div><strong>{settings.promoTitle.split("\n").map((line, index) => <span key={`${line}-${index}`}>{line}{index < settings.promoTitle.split("\n").length - 1 ? <br /> : null}</span>)}</strong><i /></div>
        <img src="/branding/ba-virtual-logo-white.svg" alt="British Airways Virtual" />
      </section>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="news-page">
        <div className="news-breadcrumb-band">
          <div className="news-shell news-breadcrumbs"><Link href="/">Home</Link><span>›</span><span>British Airways Virtual</span><span>›</span><strong>News & announcements</strong></div>
        </div>

        {settings.heroMode === "image" ? (
          <section className="news-hero news-hero-image-mode">
            <img className="news-hero-banner-image" src={settings.heroImage} alt="News & announcements" style={{ objectPosition: settings.heroImagePosition }} />
          </section>
        ) : (
          <section className="news-hero">
            <div className="news-shell news-hero-inner">
              <div className="news-hero-copy">
                <span className="news-kicker">{settings.heroKicker}</span>
                <h1>{settings.heroTitle}</h1>
                <i />
                <p>{settings.heroDescription}</p>
              </div>
              <div className="news-hero-latest">
                <strong>{settings.heroSideTitle}</strong>
                <span>{settings.heroSideText}</span>
                <i />
                <small>{settings.heroTagline}</small>
              </div>
              <div className="news-hero-network" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
              <div className="news-hero-tag" aria-hidden="true">People<br />Routes<br />Community<br />Opportunity</div>
            </div>
          </section>
        )}

        <nav className="news-section-nav" aria-label="News sections">
          <div className="news-shell"><a className="active" href="#overview">{settings.navLabels.overview}</a><a href="#latest">{settings.navLabels.latest}</a><a href="#announcements">{settings.navLabels.announcements}</a><a href="#operations">{settings.navLabels.operations}</a><a href="#community">{settings.navLabels.community}</a></div>
        </nav>

        <div className="news-shell news-layout" id="overview">
          <div className="news-main-column">{settings.mainSections.map(renderMain)}</div>
          <aside className="news-sidebar">{settings.sidebarSections.map(renderSidebar)}</aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
