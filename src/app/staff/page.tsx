import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getEvents } from "@/lib/event-store";
import { getManagedRoutes } from "@/lib/route-store";
import { requireStaffSession } from "@/lib/staff-auth";
import { getStaffPreferences } from "@/lib/staff-preferences";
import { getStaffState, hasPermission } from "@/lib/staff-store";
import { StaffBackgroundControl } from "./StaffBackgroundControl";
import { StaffCentre } from "./StaffCentre";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff Centre",
  description: "Administrative controls for British Airways Virtual staff.",
};

export default async function StaffPage() {
  const session = await requireStaffSession();
  const state = await getStaffState();
  const account = state.users.find((user) => user.id === session.userId);
  const canViewEvents = Boolean(account && hasPermission(state, account, "events.view"));
  const canViewRoutes = Boolean(account && hasPermission(state, account, "routes.view"));
  const canViewPermissions = Boolean(account && hasPermission(state, account, "users.view"));
  const preferences = await getStaffPreferences(session.userId);
  const staffBackground = preferences.staffPageBackground;
  const [events, routes] = await Promise.all([
    canViewEvents ? getEvents() : Promise.resolve([]),
    canViewRoutes ? getManagedRoutes() : Promise.resolve([]),
  ]);

  return (
    <>
      <SiteHeader />
      <main
        className="staff-page"
        style={staffBackground ? {
          backgroundImage: `linear-gradient(rgba(245,248,252,.42), rgba(245,248,252,.42)), url("${staffBackground}")`,
          backgroundSize: "100% auto",
          backgroundPosition: "top center",
          backgroundRepeat: "no-repeat",
        } : undefined}
      >
        <div className="staff-page-content">
          <div className="staff-breadcrumb-band">
            <div className="staff-shell staff-breadcrumbs">
              <Link href="/">Home</Link><span>›</span><span>British Airways Virtual</span><span>›</span><span>Manage</span><span>›</span><strong>Staff centre</strong>
              {canViewPermissions ? <><span>·</span><Link href="/staff/permissions">User permissions</Link></> : null}
            </div>
          </div>
          {canViewPermissions ? (
            <div className="staff-shell staff-permissions-launch-wrap">
              <Link className="staff-permissions-launch" href="/staff/permissions">
                <span className="staff-permissions-launch-icon" aria-hidden="true">⚙</span>
                <span>
                  <strong>User permissions</strong>
                  <small>Manage staff roles, individual permissions and access controls.</small>
                </span>
                <b aria-hidden="true">→</b>
              </Link>
            </div>
          ) : null}
          <StaffBackgroundControl initialBackground={staffBackground} />
          <StaffCentre initialEvents={events} initialRoutes={routes} staffName={session.name} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
