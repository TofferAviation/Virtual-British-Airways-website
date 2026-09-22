import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { requireStaffPermission } from "@/lib/staff-auth";
import { getSiteTrafficSummary } from "@/lib/site-traffic";
import styles from "./traffic.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Website Traffic | Staff Centre",
  description: "Private first-party website traffic overview for British Airways Virtual staff.",
};

function number(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function date(value: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function countryName(code: string) {
  try {
    return new Intl.DisplayNames("en-GB", { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export default async function StaffTrafficPage() {
  await requireStaffPermission("settings.view");
  const traffic = await getSiteTrafficSummary();
  const hasTraffic = traffic.totals.pageViews > 0;

  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <section className={styles.hero}>
          <div>
            <span className={styles.kicker}>Staff centre · website traffic</span>
            <h1>Website traffic</h1>
            <p>See how the public BAV website is being used, without identifying the people behind the visits.</p>
          </div>
          <Link className={styles.back} href="/staff">Back to Staff Centre</Link>
        </section>

        <section className={styles.privacy} aria-label="Privacy note">
          <span aria-hidden="true">⌁</span>
          <p><strong>Private first-party measurement.</strong> Counts are aggregate only: no names, account IDs, IP addresses, search terms or visitor profiles are retained. When the hosting edge provides it, only a broad country code is added to that day&apos;s session total. A visit means a browser session, not a unique person.</p>
        </section>

        <section className={styles.metrics} aria-label="Traffic totals">
          <article className={styles.metric}><span>All session visits</span><strong>{number(traffic.totals.visits)}</strong><small>Since collection began</small></article>
          <article className={styles.metric}><span>All page views</span><strong>{number(traffic.totals.pageViews)}</strong><small>Since collection began</small></article>
          <article className={styles.metric}><span>Today&apos;s visits</span><strong>{number(traffic.today.visits)}</strong><small>{date(traffic.today.date, { day: "numeric", month: "long", year: "numeric" })}</small></article>
          <article className={styles.metric}><span>Today&apos;s page views</span><strong>{number(traffic.today.pageViews)}</strong><small>Public pages only</small></article>
        </section>

        {!hasTraffic ? <section className={styles.empty}><h2>Collection is ready</h2><p>Traffic will appear here as visitors use the public website. This overview starts from its release date and does not add historical data.</p></section> : null}

        <section className={styles.grid}>
          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><span>Last 14 days</span><h2>Daily activity</h2></div><small>Latest days first</small></div>
            {traffic.recentDays.length ? <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Session visits</th><th>Page views</th></tr></thead><tbody>{[...traffic.recentDays].reverse().map((day) => <tr key={day.date}><td>{date(day.date)}</td><td>{number(day.visits)}</td><td>{number(day.pageViews)}</td></tr>)}</tbody></table></div> : <p className={styles.panelEmpty}>No activity has been collected yet.</p>}
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><span>All public traffic</span><h2>Popular pages</h2></div><small>By page views</small></div>
            {traffic.popularPages.length ? <div className={styles.tableWrap}><table><thead><tr><th>Page</th><th>Views</th><th>Landing visits</th></tr></thead><tbody>{traffic.popularPages.map((page) => <tr key={page.path}><td><code>{page.path}</code></td><td>{number(page.pageViews)}</td><td>{number(page.visits)}</td></tr>)}</tbody></table></div> : <p className={styles.panelEmpty}>Popular pages will appear after the first public visits.</p>}
          </article>

          <article className={`${styles.panel} ${styles.countries}`}>
            <div className={styles.panelHeading}><div><span>All country-tagged sessions</span><h2>Top visitor countries</h2></div><small>Top 10 · session visits</small></div>
            {traffic.topCountries.length ? <div className={styles.tableWrap}><table><thead><tr><th>Rank</th><th>Country</th><th>Session visits</th><th>Share</th></tr></thead><tbody>{traffic.topCountries.map((country, index) => <tr key={country.code}><td>{index + 1}</td><td><span className={styles.countryName}>{countryName(country.code)}</span><code>{country.code}</code></td><td>{number(country.visits)}</td><td>{traffic.countryTrackedVisits ? `${Math.round(country.visits / traffic.countryTrackedVisits * 100)}%` : "—"}</td></tr>)}</tbody></table></div> : <p className={styles.panelEmpty}>Country totals will appear once the hosting edge supplies a country code for public session visits. Existing traffic is not backfilled.</p>}
          </article>
        </section>

        <p className={styles.started}>Traffic collection began {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(traffic.startedAt))}. Country totals begin with this release and include only public pages.</p>
      </main>
      <SiteFooter />
    </>
  );
}
