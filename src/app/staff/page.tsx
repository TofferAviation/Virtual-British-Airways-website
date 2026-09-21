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
  const canViewServiceStatus = Boolean(account && hasPermission(state, account, "status.view"));
  const canViewFleet = Boolean(account && hasPermission(state, account, "fleet.view"));
  const canViewTraffic = Boolean(account && hasPermission(state, account, "settings.view"));
  const canEditSettings = Boolean(account && hasPermission(state, account, "settings.edit"));
  const canAccessServiceSettings = Boolean(account && hasPermission(state, account, SERVICE_SOURCE_PERMISSION));
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
              <Link href="/">Home</Link><span>›</span><span>British Airways Virtual</span><span>›</span><span>Manage</span><span>›</span><strong>Staff centre</strong><span>·</span><Link href="/staff/sop">Staff SOP</Link><span>·</span><Link href="/handbook#staff">Staff handbook</Link>
              {canViewRoutes ? <><span>·</span><Link href="/staff/live-operations">Live Operations</Link><span>·</span><Link href="/staff/pireps">PIREP Centre</Link></> : null}
              {canViewNews ? <><span>·</span><Link href="/staff/news">News & announcements</Link></> : null}
              {canViewSupport ? <><span>·</span><Link href="/staff/tickets">Ticket Centre</Link></> : null}
              {canViewPermissions ? <><span>·</span><Link href="/staff/pilots">Pilot Management</Link>{canEditPilots ? <><span>·</span><Link href="/staff/hour-transfers">Transfer credit review</Link></> : null}<span>·</span><Link href="/staff/permissions">User permissions</Link></> : null}
              {canViewServiceStatus ? <><span>·</span><Link href="/staff/service-status">Service status</Link></> : null}
              {canViewFleet ? <><span>·</span><Link href="/staff/fleet">Fleet management</Link></> : null}
              {canViewTraffic ? <><span>·</span><Link href="/staff/traffic">Website traffic</Link></> : null}
              {canEditSettings ? <><span>·</span><Link href="/staff/rewards">Reward settings</Link></> : null}
              {canAccessServiceSettings ? <><span>·</span><Link href="/staff/service-settings">Service settings</Link></> : null}
            </div>
          </div>
          <div className="staff-shell staff-permissions-launch-wrap">
            <Link className="staff-permissions-launch" href="/staff/sop">
              <span className="staff-permissions-launch-icon" aria-hidden="true">▤</span>
              <span><strong>Staff Centre Standard Operating Procedure</strong><small>Start here for secure, consistent procedures for PIREPs, pilots, fleet, events, support and shift handover.</small></span>
              <b aria-hidden="true">→</b>
            </Link>
          </div>
          {canViewRoutes ? (
            <>
              <div className="staff-shell staff-permissions-launch-wrap">
                <Link className="staff-permissions-launch" href="/staff/live-operations">
                  <span className="staff-permissions-launch-icon" aria-hidden="true">◉</span>
                  <span><strong>Live Operations</strong><small>Watch active BAV ACARS flights, simulator source, connection health and live telemetry.</small></span>
                  <b aria-hidden="true">→</b>
                </Link>
              </div>
              <div className="staff-shell staff-permissions-launch-wrap">
                <Link className="staff-permissions-launch" href="/staff/pireps">
                  <span className="staff-permissions-launch-icon" aria-hidden="true">✈</span>
                  <span><strong>PIREP Centre</strong><small>Review automatic Ember ACARS and manual fallback reports, request corrections and approve career credit.</small></span>
                  <b aria-hidden="true">→</b>
                </Link>
              </div>
            </>
          ) : null}
          {canViewSupport ? <div className="staff-shell staff-permissions-launch-wrap"><Link className="staff-permissions-launch" href="/staff/tickets"><span className="staff-permissions-launch-icon" aria-hidden="true">✉</span><span><strong>Ticket Centre</strong><small>Review pilot support requests, reply, assign ownership and manage ticket status.</small></span><b aria-hidden="true">→</b></Link></div> : null}
          {canViewNews ? <div className="staff-shell staff-permissions-launch-wrap"><Link className="staff-permissions-launch" href="/staff/news"><span className="staff-permissions-launch-icon" aria-hidden="true">⚑</span><span><strong>News & announcements</strong><small>Create, edit and publish the stories shown on the public What&apos;s New page.</small></span><b aria-hidden="true">→</b></Link></div> : null}
          {canViewPermissions ? <><div className="staff-shell staff-permissions-launch-wrap"><Link className="staff-permissions-launch" href="/staff/pilots"><span className="staff-permissions-launch-icon" aria-hidden="true">♙</span><span><strong>Pilot Management</strong><small>Search native BAV pilot accounts, review career activity, add exceptional career credit and suspend or reactivate pilots.</small></span><b aria-hidden="true">→</b></Link></div>{canEditPilots ? <div className="staff-shell staff-permissions-launch-wrap"><Link className="staff-permissions-launch" href="/staff/hour-transfers"><span className="staff-permissions-launch-icon" aria-hidden="true">↟</span><span><strong>Transfer credit review</strong><small>Manually verify former virtual-airline hours, approve career credit or leave a clear decline decision.</small></span><b aria-hidden="true">→</b></Link></div> : null}<div className="staff-shell staff-permissions-launch-wrap"><Link className="staff-permissions-launch" href="/staff/permissions"><span className="staff-permissions-launch-icon" aria-hidden="true">⚙</span><span><strong>User permissions</strong><small>Manage staff roles, individual permissions and access controls.</small></span><b aria-hidden="true">→</b></Link></div></> : null}
          {canViewServiceStatus ? <div className="staff-shell staff-permissions-launch-wrap"><Link className="staff-permissions-launch" href="/staff/service-status"><span className="staff-permissions-launch-icon" aria-hidden="true">◔</span><span><strong>Service status manager</strong><small>Manage system health, public incidents, maintenance and uptime information.</small></span><b aria-hidden="true">→</b></Link></div> : null}
          {canViewFleet ? <div className="staff-shell staff-permissions-launch-wrap"><Link className="staff-permissions-launch" href="/staff/fleet"><span className="staff-permissions-launch-icon" aria-hidden="true">✈</span><span><strong>Fleet management</strong><small>Review the live aircraft fleet, technical condition and dispatch availability.</small></span><b aria-hidden="true">→</b></Link></div> : null}
          {canViewTraffic ? <div className="staff-shell staff-permissions-launch-wrap"><Link className="staff-permissions-launch" href="/staff/traffic"><span className="staff-permissions-launch-icon" aria-hidden="true">◫</span><span><strong>Website traffic</strong><small>Review private, first-party visit totals and the public pages pilots use most.</small></span><b aria-hidden="true">→</b></Link></div> : null}
          {canEditSettings ? <div className="staff-shell staff-permissions-launch-wrap"><Link className="staff-permissions-launch" href="/staff/rewards"><span className="staff-permissions-launch-icon" aria-hidden="true">★</span><span><strong>Reward settings</strong><small>Configure future PIREP VA Points, Tier Points and membership thresholds.</small></span><b aria-hidden="true">→</b></Link></div> : null}
          {canAccessServiceSettings ? <div className="staff-shell staff-permissions-launch-wrap"><Link className="staff-permissions-launch staff-service-launch" href="/staff/service-settings"><span className="staff-permissions-launch-icon" aria-hidden="true">⌘</span><span><strong>Service settings</strong><small>Open the protected website source workspace for maintenance and direct code changes.</small></span><b aria-hidden="true">→</b></Link></div> : null}
          <StaffBackgroundControl initialBackground={staffBackground} />
          <StaffCentre initialEvents={events} initialRoutes={routes} staffName={session.name} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
