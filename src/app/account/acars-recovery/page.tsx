import Link from "next/link";
import { listRecoverableAcarsSessionsForPilot } from "@/lib/acars-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { listPilotPireps } from "@/lib/pilot-operations-store";
import { recoverAcarsFlightAction } from "./actions";
import styles from "../profile/profile.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recover Ember flight" };

function duration(startedAt: string, endedAt: string) {
  const minutes = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export default async function AcarsRecoveryPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const pilot = await requirePilotSession();
  const [sessions, pireps, query] = await Promise.all([
    listRecoverableAcarsSessionsForPilot(pilot.pilotId, 20), listPilotPireps(pilot.pilotId), searchParams,
  ]);
  const submittedIds = new Set(pireps.map((pirep) => pirep.acarsSessionId).filter((id): id is string => Boolean(id)));
  const recoverable = sessions.filter((session) => !submittedIds.has(session.id));
  const error = query.error === "insufficient-telemetry" ? "This session has too little saved telemetry to create an honest PIREP."
    : query.error ? "The recovery could not be completed. The original flight data remains safe; please try again or contact Operations." : null;

  return <main className={styles.page}><div className={styles.shell}>
    <nav className={styles.breadcrumbs}><Link href="/account">Pilot account</Link><span>›</span><strong>Recover Ember flight</strong></nav>
    <section className={styles.hero}><div><span className={styles.eyebrow}>EMBER SAFEGUARD</span><h1>Recover an interrupted flight</h1><p>Sessions saved by Ember remain available here if the app, simulator or connection closes before the automatic PIREP is created.</p></div></section>
    {error ? <p className="pilot-profile-message" role="alert">{error}</p> : null}
    <section className="pilot-profile-card"><span className="pilot-profile-kicker">PRIVATE ACARS HISTORY</span><h2>Saved flight sessions</h2><p>Recovery uses only your recorded ACARS telemetry. It submits the normal pending PIREP, preserves the original route trace and will not create a duplicate report.</p>
      {recoverable.length ? <div className="acars-recovery-list">{recoverable.map((session) => {
        const end = session.lastSnapshot?.timestamp ?? session.completedAt ?? session.updatedAt;
        const eligible = Boolean(session.lastSnapshot) && session.distanceNm >= 5;
        return <article key={session.id}><div><strong>{session.flightNumber} · {session.from} → {session.to}</strong><span>{session.aircraft} · {Math.round(session.distanceNm).toLocaleString("en-GB")} NM · {duration(session.startedAt, end)}</span><small>{session.status === "completed" ? "Completed session awaiting PIREP recovery" : "Tracking stopped before PIREP submission"}</small></div><form action={recoverAcarsFlightAction}><input type="hidden" name="sessionId" value={session.id} /><button disabled={!eligible}>{eligible ? "Recover flight report" : "Telemetry incomplete"}</button></form></article>;
      })}</div> : <p>No interrupted Ember flights are waiting for recovery.</p>}
    </section>
    <div className={styles.back}><Link href="/account">← Back to pilot dashboard</Link></div>
  </div></main>;
}
