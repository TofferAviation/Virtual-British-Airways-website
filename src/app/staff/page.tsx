import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getEvents } from "@/lib/event-store";
import { getManagedRoutes } from "@/lib/route-store";
import { requireStaffSession } from "@/lib/staff-auth";
import { StaffCentre } from "./StaffCentre";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff Centre",
  description: "Administrative controls for British Airways Virtual staff.",
};

export default async function StaffPage() {
  const session = await requireStaffSession();
  const [events, routes] = await Promise.all([getEvents(), getManagedRoutes()]);

  return (
    <>
      <SiteHeader />
      <main className="staff-page">
        <div className="staff-breadcrumb-band">
          <div className="staff-shell staff-breadcrumbs">
            <Link href="/">Home</Link><span>›</span><span>British Airways Virtual</span><span>›</span><span>Manage</span><span>›</span><strong>Staff centre</strong>
          </div>
        </div>
        <StaffCentre initialEvents={events} initialRoutes={routes} staffName={session.name} />
      </main>
      <SiteFooter />
    </>
  );
}
