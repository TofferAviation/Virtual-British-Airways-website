import Link from "next/link";
import { RankInsignia } from "@/components/RankInsignia";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { listAllPireps } from "@/lib/pilot-operations-store";
import { formatPilotTypeRatings, nextPilotRank, PILOT_RANK_THRESHOLDS } from "@/lib/pilot-ranks";
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
            <div><span className={styles.eyebrow}>BAV OPERATIONS</span><h1>Pilot Management</h1><p>Review each pilot&apos;s live career, qualifications and operational queue from one clear record. Rank normally follows accepted BAV hours; an override is reserved for genuine operational need.</p></div>
            <div className={styles.summary} aria-label="Pilot account summary"><article><em aria-hidden="true">◉</em><span>Total pilots</span><strong>{pilots.length}</strong></article><article><em aria-hidden="true">✓</em><span>Active</span><strong>{pilots.filter((pilot) => pilot.status === "active").length}</strong></article><article><em aria-hidden="true">—</em><span>Suspended</span><strong>{pilots.filter((pilot) => pilot.status === "suspended").length}</strong></article></div>
          </header>

          <div className={styles.rankPolicy}>
            <div><span className={styles.policyKicker}>Career framework</span><strong>BAV flight-deck progression</strong></div>
            <div className={styles.rankLadder}>{PILOT_RANK_THRESHOLDS.map((level) => <span key={level.rank}><b>{level.rank}</b><small>{level.minimumHours.toLocaleString()} accepted h</small></span>)}</div>
            <p>Senior Captain and Training Captain are staff-appointed. A350, 777 and 787 operations also need the relevant staff-approved type rating.</p>
          </div>

          <form className={styles.filters} method="get">
            <label><span className={styles.searchIcon} aria-hidden="true" /><input name="q" defaultValue={params.q ?? ""} placeholder="Search name, BAV number, email, rank or hub" aria-label="Search pilots" /></label>
            <select name="status" defaultValue={status}><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
            <button type="submit">Search pilots</button>
            {(q || status !== "all") ? <Link href="/staff/pilots">Clear</Link> : null}
          </form>

          <section className={styles.tableWrap}>
            <div className={styles.directoryHead}><div><span className={styles.eyebrow}>Pilot directory</span><h2>{q || status !== "all" ? `${filtered.length} matching pilot${filtered.length === 1 ? "" : "s"}` : "Live pilot records"}</h2></div><p>Career status, qualifications and support activity update from the current BAV record.</p></div>
            <div className={styles.tableHead}><span>Pilot</span><span>Career and qualifications</span><span>Operational activity</span><span>Account</span><span>Controls</span></div>
            {filtered.length ? filtered.map((pilot) => {
              const nextRank = nextPilotRank(pilot.hours);
              const initials = pilot.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "BA";
              return (
                <article className={styles.row} key={pilot.id}>
                  <div className={styles.identity}><span className={styles.avatar} style={pilot.profileImage ? { backgroundImage: `url("${pilot.profileImage}")` } : undefined}>{pilot.profileImage ? null : initials}</span><div><strong>{pilot.name}</strong><span>{pilot.pilotNumber}</span><small>{pilot.email}</small><small className={styles.hub}>{pilot.hub}</small></div></div>
                  <div className={styles.career}><strong><RankInsignia rank={pilot.rank} size="compact" />{pilot.rank}</strong><span className={styles.rankMode}>{pilot.rankOverride ? "Manual rank override" : "Automatic rank"}</span><div className={styles.metrics}><span><b>{pilot.flights}</b><small>Flights</small></span><span><b>{pilot.hours.toFixed(1)} h</b><small>Career time</small></span></div><small>{nextRank && !pilot.rankOverride ? `${Math.max(0, nextRank.minimumHours - pilot.hours).toFixed(1)} h until ${nextRank.rank}` : "Career rank confirmed"}</small><small className={styles.ratings}>{formatPilotTypeRatings(pilot.typeRatings)}</small></div>
                  <div className={styles.activity}><span className={pendingPirepCount(pilot.id) ? styles.waiting : styles.clear}>{pendingPirepCount(pilot.id)} <small>PIREP{pendingPirepCount(pilot.id) === 1 ? "" : "s"} waiting</small></span><span className={openTicketCount(pilot.id) ? styles.waiting : styles.clear}>{openTicketCount(pilot.id)} <small>open ticket{openTicketCount(pilot.id) === 1 ? "" : "s"}</small></span><small>{pilot.lastLoginAt ? `Last sign in ${new Date(pilot.lastLoginAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : "No recorded sign-in"}</small></div>
                  <div className={styles.account}><span className={`${styles.status} ${pilot.status === "active" ? styles.active : styles.suspended}`}>{pilot.status}</span><small>Joined {new Date(pilot.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}</small><small>{pilot.tier} member</small><strong>{pilot.points.toLocaleString()} <small>VA Points</small></strong><span>{pilot.tierPoints.toLocaleString()} Tier Points</span></div>
                  <PilotActions pilotId={pilot.id} status={pilot.status} canEdit={canEdit} canSuspend={canSuspend} rankOverride={pilot.rankOverride} typeRatings={pilot.typeRatings} hours={pilot.hours} />
                </article>
              );
            }) : <div className={styles.empty}>No pilots match your search.</div>}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
