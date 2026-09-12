import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { FleetServiceError, listFleetAircraft, type FleetAircraftSummary } from "@/lib/fleet-service";
import { requireStaffSession } from "@/lib/staff-auth";
import { getStaffState, hasPermission } from "@/lib/staff-store";
import styles from "./fleet.module.css";
import { FleetBoard } from "./FleetBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fleet Management",
  description: "British Airways Virtual fleet operations and technical status.",
};

export default async function FleetManagementPage() {
  const session = await requireStaffSession();
  const state = await getStaffState();
  const account = state.users.find((user) => user.id === session.userId);
  if (!account || !hasPermission(state, account, "fleet.view")) redirect("/staff?denied=permissions");
  const canManage = hasPermission(state, account, "fleet.manage");

  let aircraft: FleetAircraftSummary[] = [];
  let error = "";
  try {
    aircraft = await listFleetAircraft();
  } catch (caught) {
    error = caught instanceof FleetServiceError ? caught.message : "Fleet data could not be loaded.";
  }

  return <>
    <SiteHeader />
    <main className={`staff-page fleet-page ${styles.fleet}`}>
      <div className="staff-page-content">
        <div className="staff-breadcrumb-band"><div className="staff-shell staff-breadcrumbs"><Link href="/">Home</Link><span>›</span><Link href="/staff">Staff centre</Link><span>›</span><strong>Fleet management</strong></div></div>
        <section className="staff-shell fleet-hero">
          <div><span className="staff-kicker">Fleet control</span><h1>Aircraft status, technical condition and dispatch availability.</h1><p>One live fleet record for each British Airways Virtual aircraft. Operational updates remain traceable through the technical log and audit history.</p></div>
          <div className="fleet-hero-status"><span>Fleet data</span><strong className={error ? "warning" : "live"}>{error ? "Configuration required" : "Live"}</strong><small>{error || "Connected to the authoritative fleet database."}</small></div>
        </section>
        <section className="staff-shell fleet-board"><FleetBoard initialAircraft={aircraft} canManage={canManage} /></section>
      </div>
    </main>
    <SiteFooter />
  </>;
}
