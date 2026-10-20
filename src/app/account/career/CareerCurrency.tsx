import Link from "next/link";
import type { VirtualCurrencyEntry } from "@/lib/career-currency";
import styles from "./CareerCurrency.module.css";

function blockTime(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "No accepted flight recorded";
}

export function CareerCurrency({ entries, windowDays }: { entries: VirtualCurrencyEntry[]; windowDays: number }) {
  return <article className="career-card career-card-wide career-module career-module-currency"><div className="career-card-head"><div><span>VIRTUAL CURRENCY &amp; RECENCY · GUIDANCE</span><h2>Keep your flying familiar</h2></div><Link href="/account/qualifications">Type Rating Academy →</Link></div>
    <p>A {windowDays}-day view of accepted BAV flights against your virtual type-rating records. This is optional planning guidance—not real-world licensing, a legal currency calculation, or a restriction on virtual flying.</p>
    {entries.length ? <section className={styles.grid} aria-label="Virtual currency by aircraft family">{entries.map((entry) => <div className={styles.entry} key={entry.id}><div className={styles.heading}><div><strong>{entry.name}</strong><small>Last accepted flight: {date(entry.lastFlightAt)}</small></div><span className={styles[entry.state]}>{entry.stateLabel}</span></div><div className={styles.metrics}><div><span>LAST {windowDays} DAYS</span><strong>{entry.sectorsInWindow} {entry.sectorsInWindow === 1 ? "sector" : "sectors"}</strong></div><div><span>BLOCK TIME</span><strong>{blockTime(entry.blockMinutesInWindow)}</strong></div><div><span>RECORD STATUS</span><strong>{entry.qualificationStatus.replaceAll("_", " ")}</strong></div></div></div>)}</section> : <div className={styles.empty}><strong>No virtual type-rating records yet</strong><span>Once BAV Operations issue an aircraft-family qualification, its accepted-flight history can appear here.</span></div>}
    <p className={styles.note}>A refresher suggestion does not change your rank, booking access, qualification, PIREP review, points or pilot record. Training and recurrent decisions stay with the established Academy and BAV Operations workflow.</p>
  </article>;
}
