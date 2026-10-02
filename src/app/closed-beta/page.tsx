import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { closedBetaEnabled } from "@/lib/closed-beta";
import { PilotLoginForm } from "@/app/login/PilotLoginForm";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Closed beta access",
  description: "Invitation-only access to British Airways Virtual.",
};

function safeNextPath(value?: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") && !value.startsWith("/closed-beta") ? value : "/";
}

export default async function ClosedBetaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!closedBetaEnabled()) redirect("/");
  const nextPath = safeNextPath((await searchParams).next);

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.header}><BrandLogo variant="white" priority /><span>PEOPLE · PLACES · POSSIBILITIES</span></header>
      <section className={styles.card} aria-labelledby="closed-beta-title">
        <div className={styles.mark} aria-hidden="true">✦</div>
        <span className={styles.eyebrow}>British Airways Virtual · Closed beta</span>
        <h1 id="closed-beta-title">Welcome back</h1>
        <p className={styles.intro}>Sign in to access the closed beta. Together, we&apos;re building something extraordinary.</p>
        <PilotLoginForm returnTo={nextPath} closedBeta />
        <div className={styles.invited}><span>Invited users only</span><p>Don&apos;t have access yet? Stay tuned.</p></div>
      </section>
      <footer className={styles.footer}><span>Built by enthusiasts for aviation</span><span>Community simulation · real experience</span></footer>
    </main>
  );
}
