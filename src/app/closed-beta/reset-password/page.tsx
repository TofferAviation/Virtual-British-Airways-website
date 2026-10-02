import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordResetConfirmForm } from "@/app/reset-password/PasswordResetConfirmForm";
import { closedBetaEnabled } from "@/lib/closed-beta";
import styles from "../recovery.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Choose a password | Private preview" },
  description: "Choose a new private-preview password.",
};

type ResetPasswordPageProps = { searchParams: Promise<{ token?: string }> };

export default async function ClosedBetaResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const token = (await searchParams).token ?? "";
  if (!closedBetaEnabled()) {
    redirect(token ? `/reset-password?token=${encodeURIComponent(token)}` : "/reset-password");
  }

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.header}><span>PRIVATE AVIATION PREVIEW</span><span>INVITATION ONLY</span></header>
      <section className={styles.card} aria-labelledby="choose-password-title">
        <div className={styles.mark} aria-hidden="true">✦</div>
        <span className={styles.eyebrow}>Private preview · account recovery</span>
        <h1 id="choose-password-title">Choose a new password</h1>
        <p className={styles.intro}>Use at least 10 characters. This reset link can be used once only.</p>
        <PasswordResetConfirmForm token={token} returnHref="/closed-beta" privatePreview />
      </section>
      <footer className={styles.footer}><span>Built for the aviation community</span><span>Private preview · invitation only</span></footer>
    </main>
  );
}
