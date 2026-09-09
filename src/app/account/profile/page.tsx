import Link from "next/link";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";
import { ProfileForms } from "./ProfileForms";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pilot profile" };

export default async function PilotProfilePage() {
  const session = await requirePilotSession();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot) return null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.breadcrumbs}><Link href="/account">Pilot account</Link><span>›</span><strong>Profile & security</strong></nav>
        <section className={styles.hero}>
          <div><span className={styles.eyebrow}>BRITISH AIRWAYS VIRTUAL</span><h1>Profile & security</h1><p>Manage your in-house BAV pilot identity and account security.</p></div>
          <div className={styles.identity}><span>{pilot.pilotNumber}</span><strong>{pilot.name}</strong><small>{pilot.rank} · {pilot.tier} member</small></div>
        </section>
        <section className={styles.statusRow}>
          <article><span>ACCOUNT STATUS</span><strong className={pilot.status === "active" ? styles.active : styles.suspended}>{pilot.status}</strong></article>
          <article><span>HOME HUB</span><strong>{pilot.hub}</strong></article>
          <article><span>MEMBER SINCE</span><strong>{new Date(pilot.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</strong></article>
          <article><span>LAST SIGN IN</span><strong>{pilot.lastLoginAt ? new Date(pilot.lastLoginAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}</strong></article>
        </section>
        <ProfileForms name={pilot.name} email={pilot.email} />
        <div className={styles.back}><Link href="/account">← Back to pilot dashboard</Link></div>
      </div>
    </main>
  );
}
