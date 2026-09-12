import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { listLiveAcarsSessions } from "@/lib/acars-store";
import { requireStaffSession } from "@/lib/staff-auth";
import { LiveOperationsTracker } from "@/components/LiveOperationsTracker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live Operations" };

export default async function LiveOperationsPage() {
  await requireStaffSession();
  const sessions = await listLiveAcarsSessions();

  return <>
    <SiteHeader />
    <main className="ops-page">
      <section className="ops-hero"><div className="ops-shell"><span className="ops-kicker">BAV Operations</span><h1>Live Operations</h1><p>Active FreeFlight BAV ACARS flights across X-Plane 12, Microsoft Flight Simulator 2020 and Microsoft Flight Simulator 2024.</p></div></section>
      <LiveOperationsTracker initialSessions={sessions} />
    </main>
    <SiteFooter />
  </>;
}
