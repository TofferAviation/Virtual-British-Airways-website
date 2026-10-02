import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordResetRequestForm } from "@/app/forgot-password/PasswordResetRequestForm";
import { closedBetaEnabled } from "@/lib/closed-beta";
import styles from "../recovery.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Reset password | Private preview" },
  description: "Request a private-preview password reset.",
};

export default function ClosedBetaForgotPasswordPage() {
  if (!closedBetaEnabled()) redirect("/forgot-password");

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.header}><span>PRIVATE AVIATION PREVIEW</span><span>INVITATION ONLY</span></header>
      <section className={styles.card} aria-labelledby="password-reset-title">
        <div className={styles.mark} aria-hidden="true">✦</div>
        <span className={styles.eyebrow}>Private preview · account recovery</span>
        <h1 id="password-reset-title">Reset your password</h1>
        <p className={styles.intro}>Enter your invitation email and we&apos;ll send a secure, single-use reset link.</p>
        <PasswordResetRequestForm backHref="/closed-beta" privatePreview />
        <p className={styles.security}>For security, reset links expire after one hour. We never reveal whether an email address has an active account.</p>
      </section>
      <footer className={styles.footer}><span>Built for the aviation community</span><span>Private preview · invitation only</span></footer>
    </main>
  );
}
