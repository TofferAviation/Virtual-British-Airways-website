import Link from "next/link";
import { AllianceShell } from "@/components/AllianceShell";
import { allianceBalances, allianceMilestones, secondsDisplay } from "@/lib/alliance";
import { allianceReadiness, listAllianceLedger } from "@/lib/alliance-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { listPilotQualifications } from "@/lib/pilot-career";
export const dynamic = "force-dynamic";
export default async function AlliancePassport() {
  const session = await requirePilotSession(), ready = await allianceReadiness();
  if (!ready.ready) return <AllianceShell title="Alliance career passport" intro="A record of your virtual operating experience."><p>Alliance banking is awaiting setup.</p></AllianceShell>;
  const [entries, qualifications] = await Promise.all([listAllianceLedger(session.pilotId), listPilotQualifications(session.pilotId)]), banks = allianceBalances(entries);
  return <AllianceShell title="Alliance career passport" intro="Explore your operating experience across airlines. Stamps and milestones are based on approved ledger entries; they do not issue real-world qualifications."><p><Link href="/account/passport">Open your existing BA Virtual passport</Link> · <Link href="/account/career">Manage career and qualifications</Link></p><div className="alliance-passport">{banks.map(b => <article key={b.carrierId} className="alliance-stamp"><span className="alliance-label">AIRLINE EXPERIENCE</span><h2>{ready.carriers.find(c => c.id === b.carrierId)?.name ?? b.carrierId}</h2><p>{secondsDisplay(b.seconds)} · {b.sectors} sectors</p><p>{b.destinations.join(" · ")}</p><small>Milestones: {allianceMilestones(entries).filter(m => m.active && m.carrierId === b.carrierId).map(m => secondsDisplay(m.seconds)).join(" · ") || "First sector recorded"}</small><p><Link href={`/account/alliance/${b.carrierId}`}>View bank logbook</Link></p></article>)}</div>{!banks.length ? <p>Your first approved alliance sector creates its airline stamp.</p> : null}<section className="alliance-section"><h2>Existing virtual qualifications</h2>{qualifications.length ? <ul>{qualifications.map(q => <li key={q.id}>{q.qualificationDefinitionId} · {q.status}</li>)}</ul> : <p>No formal career qualifications recorded. Fly and Career modes remain available without issuing qualifications.</p>}</section></AllianceShell>;
}
