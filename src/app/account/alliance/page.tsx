import Link from "next/link";
import { AllianceShell } from "@/components/AllianceShell";
import { AllianceLogbook } from "@/components/AllianceLogbook";
import { allianceBalances, secondsDisplay } from "@/lib/alliance";
import { allianceReadiness, getAllianceExportHistory, getAllianceSalaryWithheld, listAllianceLedger } from "@/lib/alliance-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";
export const dynamic = "force-dynamic";
export default async function AllianceCareer() {
  const session = await requirePilotSession(), ready = await allianceReadiness();
  if (!ready.ready) return <AllianceShell title="My alliance career" intro="Your BA Virtual identity, with a separate bank for every operating airline."><p>Alliance banking is awaiting database setup.</p></AllianceShell>;
  const [pilot, entries, exports, withheld] = await Promise.all([getPilotById(session.pilotId), listAllianceLedger(session.pilotId), getAllianceExportHistory(session.pilotId), getAllianceSalaryWithheld(session.pilotId)]);
  if (!pilot) return null;
  const banks = allianceBalances(entries), total = banks.reduce((s, b) => s + b.seconds, 0), sectors = banks.reduce((s, b) => s + b.sectors, 0);
  return <AllianceShell title="My alliance career" intro="Your approved airline banks sit alongside your BA career. The same flown time is credited to both views; those balances are never added together as extra flight time.">
    <div className="alliance-stats"><div><span>BA approved career</span><strong>{secondsDisplay(pilot.hours * 3600)}</strong></div><div><span>Unique lifetime time</span><strong>{secondsDisplay(pilot.hours * 3600 + (pilot.allianceUncreditedSeconds ?? 0))}</strong></div><div><span>Alliance bank hours</span><strong>{secondsDisplay(total)}</strong></div><div><span>Airlines / approved alliance sectors</span><strong>{banks.length} / {sectors}</strong></div></div>
    {withheld > 0 ? <p className="alliance-notice">£{withheld.toFixed(2)} of future virtual alliance pay will be withheld following a reversed credit. Your existing finance balance remains protected.</p> : null}
    <p>{pilot.flights} approved sectors overall · {pilot.rank} · {pilot.allianceXp ?? 0} virtual alliance XP · {banks.length ? `Most flown airline: ${ready.carriers.find(c => c.id === banks[0].carrierId)?.name ?? banks[0].carrierId}` : "Your first approved partner flight opens its airline bank."}</p>
    <p>Existing historic career totals are preserved. They are not assigned to a partner bank without verified flight evidence.</p>
    <section className="alliance-section"><h2>Airline hour banks</h2>{banks.length ? <div className="alliance-table-wrap"><table className="alliance-table"><thead><tr><th>Airline</th><th>Bank balance</th><th>Sectors</th><th>Distance</th><th>Last flight</th></tr></thead><tbody>{banks.map(b => <tr key={b.carrierId}><td><Link href={`/account/alliance/${b.carrierId}`}>{ready.carriers.find(c => c.id === b.carrierId)?.name ?? b.carrierId}</Link></td><td>{secondsDisplay(b.seconds)}</td><td>{b.sectors}</td><td>{b.distanceNm.toLocaleString()} NM</td><td>{b.lastFlight?.slice(0, 10)}</td></tr>)}</tbody></table></div> : <div className="alliance-empty">No approved airline bank entries yet. <Link href="/oneworld/operations">Explore the route catalogue</Link>.</div>}</section>
    <section className="alliance-section"><h2>Alliance logbook</h2><AllianceLogbook entries={entries} /></section>
    <section className="alliance-section"><h2>Take a copy of your record</h2><p>Exports include verified PIREP references and net airline balances. An external VA decides whether it accepts these records. Provider sync is disabled.</p><form method="post" action="/api/pilot/alliance/export"><div className="alliance-checks"><label><input type="checkbox" name="consent" value="yes" required /> I authorise this download of my own flight record.</label></div><div className="alliance-actions"><button className="button button-outline" name="format" value="json">Download JSON</button><button className="button button-outline" name="format" value="csv">Download CSV</button></div></form>{exports.length ? <details><summary>Export history · {exports.length} recent downloads</summary><ul>{exports.map(e => <li key={e.id}>{e.created_at.slice(0, 19).replace("T", " ")} UTC · {e.format.toUpperCase()} · {e.entry_count} ledger entries</li>)}</ul></details> : null}</section>
  </AllianceShell>;
}
