import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPilotSession } from "@/lib/pilot-auth";
import { getStaffSession } from "@/lib/staff-auth";
import { isConfiguredStaffOwner } from "@/lib/staff-owner";
import styles from "@/app/closed-beta/recovery.module.css";
import { StaffLoginForm } from "./StaffLoginForm";
import { StaffSetupForm } from "./StaffSetupForm";

export const metadata: Metadata = {
  title: { absolute: "Staff access | Private preview" },
  description: "Restricted team access for a private aviation preview.",
};

function safeReturnTo(value?: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/staff";
}

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const session = await getStaffSession();
  if (session) redirect("/staff");
  const pilot = await getPilotSession();
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const canRecoverOwnerPassword = Boolean(pilot && isConfiguredStaffOwner(pilot.email));

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.header}>
        <Link href="/closed-beta" aria-label="Private preview sign-in">Private aviation preview</Link>
        <span>Authorised team</span>
      </header>

      <section className={styles.card} aria-labelledby="staff-access-title">
        <div className={styles.mark} aria-hidden="true">✦</div>
        <span className={styles.eyebrow}>Private preview · staff access</span>
        <h1 id="staff-access-title">Enter Staff Centre</h1>
        <p className={styles.intro}>Sign in to access the private preview&apos;s operational tools.</p>
        <StaffLoginForm returnTo={returnTo} />
        {canRecoverOwnerPassword ? <div className={styles.setup}><span className={styles.eyebrow}>Founding administrator</span><h2>Set or recover your staff password</h2><StaffSetupForm /></div> : null}
        <p className={styles.security}>Staff access is restricted to authorised team members. Your role controls the tools you can use.</p>
      </section>

      <footer className={styles.footer}><span>Built for the aviation community</span><span>Private preview · authorised team</span></footer>
    </main>
  );
}
