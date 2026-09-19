import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { listAllPilotHourTransferRequests, listPilots } from "@/lib/pilot-store";
import { requireStaffPermission } from "@/lib/staff-auth";
import { HourTransferReviewPanel } from "./HourTransferReviewPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transfer Credit Review" };

export default async function HourTransferReviewPage() {
  await requireStaffPermission("users.edit");
  const [requests, pilots] = await Promise.all([listAllPilotHourTransferRequests(), listPilots()]);
  const pilotsById = new Map(pilots.map((pilot) => [pilot.id, pilot]));
  const reviewItems = requests.map((request) => ({
    ...request,
    pilot: pilotsById.get(request.pilotId) ?? null,
  }));
  const pending = requests.filter((request) => request.status === "pending").length;
  const approved = requests.filter((request) => request.status === "approved").length;

  return <>
    <SiteHeader />
    <main className="hour-transfer-page">
      <div className="hour-transfer-shell">
        <nav className="hour-transfer-breadcrumbs"><Link href="/staff">Staff Centre</Link><span>›</span><Link href="/staff/pilots">Pilot Management</Link><span>›</span><strong>Transfer credit review</strong></nav>
        <header className="hour-transfer-hero"><div><span>CAREER GOVERNANCE</span><h1>Former VA transfer credit</h1><p>Review evidence, approve the appropriate career time and leave a clear decision for the pilot. Every approval and manual adjustment is recorded against the BAV pilot account.</p></div><div className="hour-transfer-summary"><article><strong>{pending}</strong><span>Awaiting review</span></article><article><strong>{approved}</strong><span>Approved</span></article><article><strong>{requests.length}</strong><span>All requests</span></article></div></header>
        <div className="hour-transfer-guidance"><b>Manual career credit</b><span>Need to correct hours without a transfer request, or add credit after a declined request? Use <Link href="/staff/pilots">Pilot Management</Link> → <em>Manage pilot</em>. A reason is required and the adjustment is kept in the pilot audit record.</span></div>
        <HourTransferReviewPanel requests={reviewItems} />
      </div>
    </main>
    <SiteFooter />
  </>;
}
