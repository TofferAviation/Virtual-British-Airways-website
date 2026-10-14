import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getEvents } from "@/lib/event-store";
import { SERVICE_SOURCE_PERMISSION } from "@/lib/permissions";
import { getManagedRoutes } from "@/lib/route-store";
import { requireStaffSession } from "@/lib/staff-auth";
import { getStaffPreferences } from "@/lib/staff-preferences";
import { getStaffState, hasPermission } from "@/lib/staff-store";
import { StaffBackgroundControl } from "./StaffBackgroundControl";
import { StaffCentre } from "./StaffCentre";
import { StaffOperationsInbox } from "./StaffOperationsInbox";

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
  const canViewNews = Boolean(account && hasPermission(state, account, "news.view"));
  const canViewSupport = Boolean(account && hasPermission(state, account, "support.view"));
  const canViewPermissions = Boolean(account && hasPermission(state, account, "users.view"));
  const canEditPilots = Boolean(account && hasPermission(state, account, "users.edit"));
  const canManageClosedBeta = Boolean(account && hasPermission(state, account, "users.roles"));
  const canViewServiceStatus = Boolean(account && hasPermission(state, account, "status.view"));
  const canViewFleet = Boolean(account && hasPermission(state, account, "fleet.view"));
  const canViewTraffic = Boolean(account && hasPermission(state, account, "settings.view"));
  const canEditSettings = Boolean(account && hasPermission(state, account, "settings.edit"));
  const canAccessServiceSettings = Boolean(account && hasPermission(state, account, SERVICE_SOURCE_PERMISSION));
  const preferences = await getStaffPreferences(session.userId);
  const staffBackground = preferences.staffPageBackground;
  const activeStaffCount = state.users.filter((user) => user.status === "active").length;
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
              <span className="staff-breadcrumb-note">Secure staff area</span>
              <Link href="/staff/sop">Staff SOP</Link>
              <Link href="/handbook#staff">Staff handbook</Link>
            </div>
          </div>
          <StaffCentre
            initialEvents={events}
            initialRoutes={routes}
            staffName={session.name}
            operationsQueue={
              <StaffOperationsInbox
                canReviewPireps={canViewRoutes}
                canManageMentoring={canEditPilots}
                canViewSupport={canViewSupport}
                canViewFleet={canViewFleet}
                canViewLiveOperations={canViewRoutes}
                canManageClosedBeta={canManageClosedBeta}
                canViewServiceStatus={canViewServiceStatus}
                activeStaffCount={activeStaffCount}
              />
            }
            workspaceDirectory={
              <section className="staff-workspace-directory" aria-labelledby="staff-workspace-directory-title">
                <div className="staff-workspace-directory-heading">
                  <div>
                    <span className="staff-kicker">Staff workspaces</span>
                    <h2 id="staff-workspace-directory-title">Find the right place, quickly</h2>
                    <p>Only the tools available to your staff role are shown here.</p>
                  </div>
                  <Link href="/staff/sop">Staff SOP →</Link>
                </div>
                <div className="staff-workspace-grid">
                  {canViewRoutes || canViewFleet || canEditPilots ? <section className="staff-workspace-group">
                    <h3>Flight operations</h3>
                    <div className="staff-workspace-links">
                      {canViewRoutes ? <Link href="/staff/live-operations"><span aria-hidden="true">◉</span><b>Live Operations</b><i aria-hidden="true">›</i></Link> : null}
                      {canViewRoutes ? <Link href="/staff/pireps"><span aria-hidden="true">✈</span><b>PIREP Centre</b><i aria-hidden="true">›</i></Link> : null}
                      {canViewFleet ? <Link href="/staff/fleet"><span aria-hidden="true">▤</span><b>Fleet management</b><i aria-hidden="true">›</i></Link> : null}
                      {canViewRoutes ? <Link href="#route-tools"><span aria-hidden="true">⌁</span><b>Schedules</b><i aria-hidden="true">›</i></Link> : null}
                      {canEditPilots ? <Link href="/staff/hour-transfers"><span aria-hidden="true">↟</span><b>Transfer credit</b><i aria-hidden="true">›</i></Link> : null}
                    </div>
                  </section> : null}
                  {canViewSupport || canViewPermissions || canEditPilots ? <section className="staff-workspace-group">
                    <h3>People &amp; support</h3>
                    <div className="staff-workspace-links">
                      {canViewSupport ? <Link href="/staff/tickets"><span aria-hidden="true">✉</span><b>Ticket Centre</b><i aria-hidden="true">›</i></Link> : null}
                      {canViewPermissions ? <Link href="/staff/pilots"><span aria-hidden="true">♙</span><b>Pilot management</b><i aria-hidden="true">›</i></Link> : null}
                      {canEditPilots ? <Link href="/staff/mentoring"><span aria-hidden="true">◎</span><b>Mentoring</b><i aria-hidden="true">›</i></Link> : null}
                      {canViewPermissions ? <Link href="/staff/permissions"><span aria-hidden="true">⚙</span><b>User permissions</b><i aria-hidden="true">›</i></Link> : null}
                      {canEditPilots ? <Link href="/staff/finances"><span aria-hidden="true">£</span><b>Pilot finance</b><i aria-hidden="true">›</i></Link> : null}
                    </div>
                  </section> : null}
                  {canViewNews || canViewTraffic || canEditPilots || canEditSettings || canViewServiceStatus || canAccessServiceSettings ? <section className="staff-workspace-group staff-workspace-group-wide">
                    <h3>Communications &amp; systems</h3>
                    <div className="staff-workspace-links">
                      {canViewNews ? <Link href="/staff/news"><span aria-hidden="true">⚑</span><b>News &amp; announcements</b><i aria-hidden="true">›</i></Link> : null}
                      {canEditPilots ? <Link href="/staff/training"><span aria-hidden="true">▥</span><b>Training &amp; qualifications</b><i aria-hidden="true">›</i></Link> : null}
                      {canViewTraffic ? <Link href="/staff/traffic"><span aria-hidden="true">◫</span><b>Website traffic</b><i aria-hidden="true">›</i></Link> : null}
                      {canEditSettings ? <Link href="/staff/rewards"><span aria-hidden="true">★</span><b>Reward settings</b><i aria-hidden="true">›</i></Link> : null}
                      {canEditSettings ? <Link href="/staff/crew-lounge"><span aria-hidden="true">☕</span><b>Ember systems</b><i aria-hidden="true">›</i></Link> : null}
                      {canEditSettings ? <Link href="/staff/voice-rooms"><span aria-hidden="true">◌</span><b>Website voice rooms</b><i aria-hidden="true">›</i></Link> : null}
                      {canViewServiceStatus ? <Link href="/staff/service-status"><span aria-hidden="true">◔</span><b>Service status</b><i aria-hidden="true">›</i></Link> : null}
                      {canAccessServiceSettings ? <Link href="/staff/service-settings"><span aria-hidden="true">⌘</span><b>Service settings</b><i aria-hidden="true">›</i></Link> : null}
                    </div>
                  </section> : null}
                </div>
              </section>
            }
          />
          <StaffBackgroundControl initialBackground={staffBackground} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
