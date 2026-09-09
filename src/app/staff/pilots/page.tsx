import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { listAllPireps } from "@/lib/pilot-operations-store";
import { listPilots } from "@/lib/pilot-store";
import { requireStaffPermission } from "@/lib/staff-auth";
import { getStaffState, hasPermission } from "@/lib/staff-store";
import { listAllTickets } from "@/lib/ticket-store";
import { PilotActions } from "./PilotActions";
import styles from "./pilots.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pilot Management" };

export default async function StaffPilotsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const session = await requireStaffPermission("users.view");
  const [state, pilots, pireps, tickets, params] = await Promise.all([getStaffState(), listPilots(), listAllPireps(), listAllTickets(), searchParams]);
  const staff = state.users.find((user) => user.id === session.userId);
  const canEdit = Boolean(staff && hasPermission(state, staff, "users.edit"));
  const canSuspend = Boolean(staff && hasPermission(state, staff, "users.suspend"));
  const q = (params.q ?? "").trim().toLowerCase();
  const status = params.status === "active" || params.status === "suspended" ? params.status : "all";

  const filtered = pilots.filter((pilot) => {
    const matchesQuery = !q || [pilot.name, pilot.email, pilot.pilotNumber, pilot.rank, pilot.hub].some((value) => value.toLowerCase().includes(q));
    const matchesStatus = status === "all" || pilot.status === status;
    return matchesQuery && matchesStatus;
  });

  const openTicketCount = (pilotId: string) => tickets.filter((ticket) => ticket.pilotId === pilotId && !["resolved", "closed"].includes(ticket.status)).length;
  const pendingPirepCount = (pilotId: string) => pireps.filter((pirep) => pirep.pilotId === pilotId && ["pending", "changes_requested"].includes(pirep.status)).length;

  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <div className={styles.shell}>
          <nav className={styles.breadcrumbs}><Link href="/staff">Staff Centre</Link><span>›</span><strong>Pilot Management</strong></nav>
          <header className={styles.hero}>
            <div><span className={styles.eyebrow}>BAV OPERATIONS</span><h1>Pilot Management</h1><p>Search, review and manage native British Airways Virtual pilot accounts.</p></div>
            <div className={styles.summary}><article><span>TOTAL PILOTS</span><strong>{pilots.length}</strong></article><article><span>ACTIVE</span><strong>{pilots.filter((pilot) => pilot.status === "active").length}</strong></article><article><span>SUSPENDED</span><strong>{pilots.filter((pilot) => pilot.status === "suspended").length}</strong></article></div>
          </header>

          <form className={styles.filters} method="get">
            <input name="q" defaultValue={params.q ?? ""} placeholder="Search pilot name, ID, email, rank or hub" />
            <select name="status" defaultValue={status}><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
            <button type="submit">Search pilots</button>
            {(q || status !== "all") ? <Link href="/staff/pilots">Clear</Link> : null}
          </form>

          <section className={styles.tableWrap}>
            <div className={styles.tableHead}><span>Pilot</span><span>Career</span><span>Activity</span><span>Account</span><span>Actions</span></div>
            {filtered.length ? filtered.map((pilot) => (
              <article className={styles.row} key={pilot.id}>
                <div className={styles.identity}><strong>{pilot.name}</strong><span>{pilot.pilotNumber} · {pilot.email}</span><small>{pilot.hub}</small></div>
                <div><strong>{pilot.rank}</strong><span>{pilot.flights} flights · {pilot.hours.toFixed(1)} h</span><small>{pilot.points.toLocaleString()} VA Points · {pilot.tierPoints.toLocaleString()} Tier Points</small></div>
                <div><strong>{pendingPirepCount(pilot.id)} PIREPs awaiting action</strong><span>{openTicketCount(pilot.id)} open support tickets</span><small>{pilot.lastLoginAt ? `Last sign in ${new Date(pilot.lastLoginAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : "Never signed in"}</small></div>
                <div><span className={`${styles.status} ${pilot.status === "active" ? styles.active : styles.suspended}`}>{pilot.status}</span><small>Joined {new Date(pilot.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}</small><small>{pilot.tier} member</small></div>
                <PilotActions pilotId={pilot.id} status={pilot.status} canEdit={canEdit} canSuspend={canSuspend} />
              </article>
            )) : <div className={styles.empty}>No pilots match your search.</div>}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
