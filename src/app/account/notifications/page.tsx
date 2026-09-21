import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { requirePilotSession } from "@/lib/pilot-auth";
import { listPilotNotifications } from "@/lib/pilot-store";
import { NotificationCentre } from "./NotificationCentre";
import "./notifications.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const session = await requirePilotSession();
  const notifications = await listPilotNotifications(session.pilotId);
  return <><SiteHeader /><main className="notifications-page"><div className="notifications-shell"><nav className="notifications-breadcrumb"><Link href="/account">Pilot dashboard</Link><span>›</span><strong>Notifications</strong></nav><NotificationCentre initialNotifications={notifications} /></div></main><SiteFooter /></>;
}
