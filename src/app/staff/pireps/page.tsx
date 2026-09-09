import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { requireStaffPermission } from "@/lib/staff-auth";
import { listAllPireps } from "@/lib/pilot-operations-store";
import { getPilotById } from "@/lib/pilot-store";
import { supportedSimulatorLabels } from "@/lib/acars-contract";
import { reviewPirepAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "PIREP Centre" };

export default async function StaffPirepsPage() {
  await requireStaffPermission("routes.view");
  const pireps = await listAllPireps();
  const pilots = new Map<string, Awaited<ReturnType<typeof getPilotById>>>();
  for (const pirep of pireps) if (!pilots.has(pirep.pilotId)) pilots.set(pirep.pilotId, await getPilotById(pirep.pilotId));
  const pending = pireps.filter((p) => p.status === "pending").length;
  const changes = pireps.filter((p) => p.status === "changes_requested").length;
  const accepted = pireps.filter((p) => p.status === "accepted").length;

  return <>
    <SiteHeader />
    <main className="ops-page staff-ops-page">
      <section className="ops-hero"><div className="ops-shell"><span className="ops-kicker">Staff Operations</span><h1>PIREP Centre</h1><p>Review flight reports from BAV pilots. Manual reports and future FreeFlight ACARS submissions from X-Plane 12, MSFS 2020 and MSFS 2024 use the same queue.</p></div></section>
      <section className="ops-shell ops-summary"><div><strong>{pending}</strong><span>Pending</span></div><div><strong>{changes}</strong><span>Changes requested</span></div><div><strong>{accepted}</strong><span>Accepted</span></div><Link className="ops-secondary" href="/staff">Back to Staff Centre</Link></section>
      <section className="ops-shell ops-pirep-list">
        {pireps.length ? pireps.map((pirep) => {
          const pilot = pilots.get(pirep.pilotId);
          const canReview = pirep.status !== "accepted";
          return <article className="ops-card ops-review-card" key={pirep.id}>
            <div className="ops-review-head"><div><span className="ops-kicker">{pilot?.pilotNumber ?? "Unknown pilot"} · {supportedSimulatorLabels[pirep.simulator]}</span><h2>{pirep.flightNumber} · {pirep.from} → {pirep.to}</h2><p>{pilot?.name ?? pirep.pilotId} · {pirep.aircraft}</p></div><span className={`ops-status ops-status-${pirep.status}`}>{pirep.status.replaceAll("_", " ")}</span></div>
            <div className="ops-review-data"><div><span>Block time</span><strong>{Math.floor(pirep.blockMinutes / 60)}h {pirep.blockMinutes % 60}m</strong></div><div><span>Distance</span><strong>{pirep.distanceNm} NM</strong></div><div><span>Landing</span><strong>{pirep.landingFpm == null ? "—" : `${pirep.landingFpm} fpm`}</strong></div><div><span>Fuel used</span><strong>{pirep.fuelUsedKg == null ? "—" : `${pirep.fuelUsedKg.toLocaleString()} kg`}</strong></div><div><span>Source</span><strong>{pirep.source === "acars" ? "FreeFlight ACARS" : "Manual"}</strong></div></div>
            {pirep.pilotComments ? <div className="ops-comments"><strong>Pilot comments</strong><p>{pirep.pilotComments}</p></div> : null}
            {pirep.staffComments ? <div className="ops-comments staff"><strong>Staff comments</strong><p>{pirep.staffComments}</p></div> : null}
            {canReview ? <form action={reviewPirepAction} className="ops-review-form"><input type="hidden" name="id" value={pirep.id} /><label><span>Review comments</span><textarea name="comments" rows={3} maxLength={2000} placeholder="Optional for approval; recommended for rejection or changes." /></label><div className="ops-actions"><button className="ops-secondary" name="decision" value="changes_requested" type="submit">Request changes</button><button className="ops-danger" name="decision" value="rejected" type="submit">Reject</button><button className="ops-primary" name="decision" value="accepted" type="submit">Accept PIREP</button></div></form> : <div className="ops-approved-note">Approved by {pirep.reviewedBy ?? "BAV Staff"} · +{pirep.pointsAwarded} VA Points · +{pirep.tierPointsAwarded} Tier Points</div>}
          </article>;
        }) : <div className="ops-card ops-empty"><h2>No PIREPs yet</h2><p>Submitted pilot flight reports will appear here.</p></div>}
      </section>
    </main>
    <SiteFooter />
  </>;
}
