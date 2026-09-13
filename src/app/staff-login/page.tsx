import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { getPilotSession } from "@/lib/pilot-auth";
import { getStaffSession } from "@/lib/staff-auth";

export const metadata: Metadata = {
  title: "Staff login",
  description: "Restricted staff access for British Airways Virtual administration.",
};

export default async function StaffLoginPage() {
  const session = await getStaffSession();
  if (session) redirect("/staff");
  const pilot = await getPilotSession();

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
            <strong>One BAV account</strong>
            <p>Staff Centre uses your existing British Airways Virtual account. There is no separate staff password or browser session to lose.</p>
          </div>
        </div>

        <div className="staff-login-card">
          <span className="section-kicker">Authorised staff only</span>
          <h2>Enter Staff Centre</h2>
          {pilot ? (
            <div className="staff-login-config-note" role="status">
              This BAV account is signed in, but it has not been assigned Staff Centre access. An administrator can grant the required role from User permissions.
            </div>
          ) : (
            <Link className="button button-primary" href="/login?returnTo=%2Fstaff">Sign in with your BAV account</Link>
          )}
          <p className="staff-login-footnote">Flight simulation only · Independent virtual airline · Not affiliated with British Airways Plc</p>
        </div>
      </section>
    </main>
  );
}
