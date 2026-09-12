import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { FleetServiceError, getFleetAircraftRecord } from "@/lib/fleet-service";
import { requireStaffSession } from "@/lib/staff-auth";
import { getStaffState, hasPermission } from "@/lib/staff-store";
import { AircraftRecord } from "../AircraftRecord";
import styles from "../fleet.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Aircraft record", description: "British Airways Virtual aircraft technical record." };

type Props = { params: Promise<{ id: string }> };

export default async function AircraftRecordPage({ params }: Props) {
  const session = await requireStaffSession();
  const state = await getStaffState();
  const account = state.users.find((user) => user.id === session.userId);
  if (!account || !hasPermission(state, account, "fleet.view")) redirect("/staff?denied=permissions");
  const { id } = await params;
  let aircraft;
  try {
    aircraft = await getFleetAircraftRecord(id);
  } catch (error) {
    if (error instanceof FleetServiceError && error.status === 404) notFound();
    throw error;
  }
  if (!aircraft) notFound();
  return <>
    <SiteHeader />
    <main className={`staff-page fleet-page ${styles.fleet}`}>
      <div className="staff-page-content">
        <div className="staff-breadcrumb-band"><div className="staff-shell staff-breadcrumbs"><Link href="/">Home</Link><span>›</span><Link href="/staff">Staff centre</Link><span>›</span><Link href="/staff/fleet">Fleet management</Link><span>›</span><strong>{aircraft.registration}</strong></div></div>
        <section className="staff-shell fleet-record-shell"><AircraftRecord aircraft={aircraft} canManage={hasPermission(state, account, "fleet.manage")} canManageDefects={hasPermission(state, account, "fleet.defects.manage")} canReportDefect={hasPermission(state, account, "fleet.defects.report")} canRelease={hasPermission(state, account, "fleet.release_to_service")} /></section>
      </div>
    </main>
    <SiteFooter />
  </>;
}
