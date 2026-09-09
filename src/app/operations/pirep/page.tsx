import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getActivePilotBooking } from "@/lib/pilot-operations-store";
import { supportedSimulatorLabels } from "@/lib/acars-contract";
import { submitManualPirep } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Submit PIREP" };

export default async function ManualPirepPage() {
  const session = await requirePilotSession();
  const booking = await getActivePilotBooking(session.pilotId);
  if (!booking) redirect("/book");

  return <>
    <SiteHeader />
    <main className="ops-page">
      <section className="ops-hero"><div className="ops-shell"><span className="ops-kicker">BAV Operations</span><h1>Submit flight report</h1><p>Use this manual PIREP while FreeFlight ACARS is under development. The same review pipeline will later receive flights automatically from X-Plane 12, MSFS 2020 and MSFS 2024.</p></div></section>
      <section className="ops-shell ops-grid">
        <aside className="ops-card ops-assignment"><span className="ops-kicker">Active assignment</span><h2>{booking.flightNumber}</h2><strong>{booking.from} → {booking.to}</strong><dl><div><dt>Aircraft</dt><dd>{booking.aircraft}</dd></div><div><dt>Date</dt><dd>{booking.date}</dd></div><div><dt>Scheduled departure</dt><dd>{booking.departure}</dd></div><div><dt>Scheduled arrival</dt><dd>{booking.arrival}</dd></div></dl><Link href="/account">← Back to account</Link></aside>
        <div className="ops-card"><span className="ops-kicker">Manual PIREP</span><h2>Flight details</h2><form action={submitManualPirep} className="ops-form">
          <div className="ops-form-grid"><label><span>Simulator</span><select name="simulator" defaultValue="xplane12">{Object.entries(supportedSimulatorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Block time (minutes)</span><input name="blockMinutes" type="number" min="1" max="1440" required /></label><label><span>Distance flown (NM)</span><input name="distanceNm" type="number" min="0" max="15000" required /></label><label><span>Landing rate (FPM)</span><input name="landingFpm" type="number" min="-3000" max="500" placeholder="e.g. -145" /></label><label><span>Fuel used (kg)</span><input name="fuelUsedKg" type="number" min="0" max="300000" /></label></div>
          <label><span>Pilot comments</span><textarea name="comments" rows={5} maxLength={2000} placeholder="Anything staff should know about the flight." /></label>
          <div className="ops-note"><strong>Review process:</strong> submitting this PIREP sends it to the Staff PIREP Centre. Career hours, flight count, distance, VA Points and Tier Points are awarded only after staff approval.</div>
          <div className="ops-actions"><Link className="ops-secondary" href="/account">Cancel</Link><button className="ops-primary" type="submit">Submit PIREP</button></div>
        </form></div>
      </section>
    </main>
    <SiteFooter />
  </>;
}
