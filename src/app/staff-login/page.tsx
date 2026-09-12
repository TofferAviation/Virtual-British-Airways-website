import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { getPilotSession } from "@/lib/pilot-auth";
import { getStaffSession, isConfiguredStaffOwnerEmail, isStaffAuthConfigured } from "@/lib/staff-auth";
import { StaffLoginForm } from "./StaffLoginForm";

export const metadata: Metadata = {
  title: "Staff login",
  description: "Restricted staff access for British Airways Virtual administration.",
};

type StaffLoginPageProps = {
  searchParams: Promise<{ reason?: string; error?: string }>;
};

const sessionFailureMessage: Record<string, string> = {
  "missing-cookie": "Your browser did not send a staff session cookie to this page.",
  "invalid-session": "The staff session could not be verified. Please sign in again.",
  "account-unavailable": "This signed-in account is no longer active in Staff Centre.",
  "not-configured": "Staff sign-in is not configured on the server.",
};

const loginErrorMessage: Record<string, string> = {
  "invalid-credentials": "The staff email or password was not accepted.",
  "not-configured": "Staff sign-in is not configured on the server.",
  "owner-pilot-not-authorized": "This signed-in pilot account is not assigned as the configured Staff Centre owner.",
};

export default async function StaffLoginPage({ searchParams }: StaffLoginPageProps) {
  const session = await getStaffSession();
  if (session) redirect("/staff");
  const pilot = await getPilotSession();
  const canRecoverFromPilot = Boolean(pilot && isConfiguredStaffOwnerEmail(pilot.email));
  const { reason, error } = await searchParams;

  return (
    <main className="staff-login-page">
      <header className="staff-login-header">
        <Link className="staff-login-brand" href="/" aria-label="British Airways Virtual home">
          <BrandLogo variant="white" priority />
        </Link>
        <Link className="staff-login-back" href="/">Return to website</Link>
      </header>

      <section className="staff-login-main">
        <div className="staff-login-copy">
          <span className="section-kicker">Staff access</span>
          <h1>Manage British Airways Virtual.</h1>
          <p>
            Staff Centre access is restricted to authorised team members. Your assigned role and individual permissions control exactly which operational tools you can use.
          </p>
          <div className="staff-login-security">
            <strong>Protected staff session</strong>
            <p>Your staff password is checked only on the server. The browser receives an HttpOnly signed session cookie, never the stored password.</p>
          </div>
        </div>

        <div className="staff-login-card">
          <span className="section-kicker">Authorised staff only</span>
          <h2>Sign in to Staff Centre</h2>
          {reason && sessionFailureMessage[reason] ? <p className="staff-login-error" role="alert">{sessionFailureMessage[reason]}</p> : null}
          {error && loginErrorMessage[error] ? <p className="staff-login-error" role="alert">{loginErrorMessage[error]}</p> : null}
          {canRecoverFromPilot ? (
            <form className="staff-login-form" action="/api/staff/owner-recovery" method="post">
              <p className="staff-login-config-note">Signed in as the configured owner pilot. Continue without entering a separate staff password.</p>
              <button className="button button-primary" type="submit">Continue as owner pilot</button>
            </form>
          ) : pilot ? (
            <div className="staff-login-config-note" role="status">
              The signed-in pilot account is not the configured Staff Centre owner. Set <code>BAV_STAFF_EMAIL</code> to this pilot account&apos;s email, save and redeploy, then return here.
            </div>
          ) : (
            <div className="staff-login-config-note" role="status">
              Owner recovery is available after signing in to your pilot account. <Link href="/login">Sign in as owner pilot</Link>, then return to this page.
            </div>
          )}
          <StaffLoginForm configured={isStaffAuthConfigured()} />
          <p className="staff-login-footnote">Flight simulation only · Independent virtual airline · Not affiliated with British Airways Plc</p>
        </div>
      </section>
    </main>
  );
}
