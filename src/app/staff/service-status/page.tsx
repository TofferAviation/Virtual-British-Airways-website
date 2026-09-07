import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getServiceStatusState, overallServiceStatus } from "@/lib/service-status-store";
import { requireStaffSession } from "@/lib/staff-auth";
import { getStaffState, hasPermission } from "@/lib/staff-store";
import { ServiceStatusManager } from "./ServiceStatusManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Service Status Manager",
  description: "Manage British Airways Virtual operational status, incidents and maintenance.",
};

export default async function StaffServiceStatusPage() {
  const session = await requireStaffSession();
  const staff = await getStaffState();
  const account = staff.users.find((user) => user.id === session.userId && user.status === "active");
  if (!account || !hasPermission(staff, account, "status.view")) notFound();

  const state = await getServiceStatusState();
  const overall = overallServiceStatus(state);
  const canEdit = hasPermission(staff, account, "status.edit");

  return (
    <>
      <SiteHeader />
      <main className="status-admin-page">
        <div className="status-admin-shell status-admin-hero">
          <div>
            <span className="status-kicker">Staff centre · service status</span>
            <h1>Service Status Manager</h1>
            <p>Update components, publish incidents and schedule maintenance. Changes appear immediately on the public status page.</p>
          </div>
          <div className="status-admin-hero-actions">
            <Link className="status-admin-button secondary" href="/staff">Back to Staff Centre</Link>
            <Link className="status-admin-button" href="/service-status" target="_blank">Open public page ↗</Link>
          </div>
        </div>

        <section className={`status-admin-shell status-overall status-admin-preview status-${overall.state}`}>
          <div className="status-overall-mark">{overall.state === "operational" ? "✓" : overall.state === "degraded" ? "!" : overall.state === "maintenance" ? "◷" : "×"}</div>
          <div className="status-overall-copy"><h2>{overall.title}</h2><p>{overall.message}</p></div>
          <div className="status-overall-meta"><small>{canEdit ? "Publishing enabled" : "Read-only access"}</small></div>
        </section>

        {!canEdit ? <div className="status-admin-shell status-admin-note">You have permission to view Service Status, but not to publish changes. A staff member with <strong>Service Status → Publish status updates</strong> can grant this through User Permissions.</div> : null}

        <ServiceStatusManager initialState={state} canEdit={canEdit} />
      </main>
      <SiteFooter />
    </>
  );
}
