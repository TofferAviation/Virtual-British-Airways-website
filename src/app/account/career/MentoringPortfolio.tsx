import Link from "next/link";

export type MentoringPortfolioRecord = { id: string; learnerName: string; flightNumber: string; from: string; to: string; aircraft: string; completedAt: string; blockMinutes: number; distanceNm: number; fuelUsedKg: number | null; staffReviewedAt: string | null };

function duration(minutes: number) { return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`; }

export function MentoringPortfolio({ records }: { records: MentoringPortfolioRecord[] }) {
  if (!records.length) return null;
  const minutes = records.reduce((total, record) => total + Math.max(0, record.blockMinutes), 0);
  const distance = records.reduce((total, record) => total + Math.max(0, record.distanceNm), 0);
  const fuel = records.reduce((total, record) => total + Math.max(0, record.fuelUsedKg ?? 0), 0);
  return <article className="career-card career-card-wide career-module career-module-mentoring"><div className="career-card-head"><div><span>MENTORING PORTFOLIO · COACHED SECTORS</span><h2>Flights you supported</h2></div><Link href="/account/career/mentoring">Open mentor flight desk →</Link></div><p>{records.length} mentoring sector{records.length === 1 ? "" : "s"} · {duration(minutes)} coached block time · {Math.round(distance).toLocaleString("en-GB")} NM observed · {Math.round(fuel).toLocaleString("en-GB")} kg fuel observed.</p><ul className="career-compact-list">{records.slice(0, 5).map((record) => <li key={record.id}><strong>MENTORING · {record.learnerName} · {record.flightNumber} · {record.from} → {record.to}</strong><span>{record.aircraft} · {duration(record.blockMinutes)} · {Math.round(record.distanceNm).toLocaleString("en-GB")} NM · {record.staffReviewedAt ? "staff assessed" : "awaiting staff assessment"}</span></li>)}</ul><p>Mentoring sectors recognise real coaching activity alongside a learner. They are kept separate from your personal PIREPs, flight hours, rank progress, qualifications, fleet currency, and financial earnings.</p></article>;
}
