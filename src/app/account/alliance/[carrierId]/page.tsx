import { notFound } from "next/navigation";
import { AllianceShell } from "@/components/AllianceShell";
import { AllianceLogbook } from "@/components/AllianceLogbook";
import { allianceBalances, allianceMilestones, secondsDisplay } from "@/lib/alliance";
import { getAllianceConfiguration, listAllianceLedger } from "@/lib/alliance-store";
import { requirePilotSession } from "@/lib/pilot-auth";
export const dynamic = "force-dynamic";
export default async function AirlineBank({ params }: { params: Promise<{ carrierId: string }> }) {
  const session = await requirePilotSession(), { carrierId } = await params;
  const [{ carriers }, ledger] = await Promise.all([getAllianceConfiguration(), listAllianceLedger(session.pilotId)]);
  const carrier = carriers.find(c => c.id === carrierId); if (!carrier) notFound();
  const entries = ledger.filter(e => e.carrierId === carrier.id), bank = allianceBalances(entries)[0];
  const last = entries.filter(e => e.kind === "approval").find(e => !entries.some(r => r.pirepId === e.pirepId && r.kind === "reversal"));
  return <AllianceShell title={`${carrier.name} hour bank`} intro="Approved operating experience, linked to the original flight reports and every subsequent correction."><div className="alliance-stats"><div><span>Airline balance</span><strong>{secondsDisplay(bank?.seconds ?? 0)}</strong></div><div><span>Approved sectors</span><strong>{bank?.sectors ?? 0}</strong></div><div><span>Distance</span><strong>{(bank?.distanceNm ?? 0).toLocaleString()} NM</strong></div><div><span>Destinations visited</span><strong>{bank?.destinations.length ?? 0}</strong></div></div><p>Aircraft: {bank?.aircraft.join(" · ") || "No approved sectors"}</p><p>Destinations: {bank?.destinations.join(" · ") || "—"}</p><p>Last route: {last ? `${last.flight.flightNumber} ${last.flight.from} → ${last.flight.to} · ${last.flight.completedAt.slice(0, 10)}` : "—"}</p><p>Milestones: {allianceMilestones(entries).filter(m => m.active).map(m => secondsDisplay(m.seconds)).join(" · ") || "None reached yet"}</p><AllianceLogbook entries={entries} /></AllianceShell>;
}
