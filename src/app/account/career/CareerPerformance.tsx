import Link from "next/link";
import type { PilotPirep } from "@/lib/pilot-operations-store";

export function CareerPerformance({ pireps }: { pireps: PilotPirep[] }) {
  const accepted = pireps.filter((item) => item.status === "accepted");
  const landings = accepted.map((item) => item.landingFpm).filter((value): value is number => value !== null);
  const averageLanding = landings.length ? Math.round(landings.reduce((total, value) => total + value, 0) / landings.length) : null;
  const latest = pireps[0] ?? null;
  return <article className="career-card career-card-wide career-module career-module-performance"><div className="career-card-head"><div><span>PERFORMANCE &amp; DEBRIEF · PREVIEW</span><h2>Recent flying insight</h2></div>{latest ? <Link href={`/account/flights/${encodeURIComponent(latest.id)}`}>Open latest debrief →</Link> : null}</div><p>{accepted.length} accepted report{accepted.length === 1 ? "" : "s"} in your available history{averageLanding == null ? ". Landing telemetry will appear after an Ember-recorded arrival." : ` · average recorded landing ${averageLanding} fpm.`}</p>{pireps.length ? <ul className="career-compact-list">{pireps.slice(0, 3).map((pirep) => <li key={pirep.id}><strong>{pirep.flightNumber} · {pirep.from} → {pirep.to}</strong><span>{pirep.landingFpm == null ? "Telemetry unavailable" : `${pirep.landingFpm} fpm`} · {pirep.status.replaceAll("_", " ")}</span></li>)}</ul> : <p>No flight reports are available yet. Complete an Ember flight or submit the manual fallback when appropriate.</p>}<p>These values explain existing BAV flight records; they never score, approve or change a PIREP.</p></article>;
}
