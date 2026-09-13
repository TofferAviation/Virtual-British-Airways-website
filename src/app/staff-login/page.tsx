import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { getPilotSession } from "@/lib/pilot-auth";
import { getStaffSession } from "@/lib/staff-auth";
import { hasStaffPasswordForEmail } from "@/lib/staff-store";
import { isConfiguredStaffOwner } from "@/lib/staff-owner";
import { StaffLoginForm } from "./StaffLoginForm";
import { StaffSetupForm } from "./StaffSetupForm";

export const metadata: Metadata = {
  title: "Staff login",
  description: "Restricted staff access for British Airways Virtual administration.",
};

function safeReturnTo(value?: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/staff";
}

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const session = await getStaffSession();
  if (session) redirect("/staff");
  const pilot = await getPilotSession();
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const canSetUpOwnerPassword = Boolean(pilot && isConfiguredStaffOwner(pilot.email) && !(await hasStaffPasswordForEmail(pilot.email)));

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
            <strong>Separate Staff Centre sign-in</strong>
            <p>Your Staff Centre email and password are separate from your BAV pilot account. Your staff role determines which operational tools you can open.</p>
          </div>
        </div>

        <div className="staff-login-card">
          <span className="section-kicker">Authorised staff only</span>
          <h2>Enter Staff Centre</h2>
          <StaffLoginForm returnTo={returnTo} />
          {canSetUpOwnerPassword ? <div className="staff-login-setup"><span className="section-kicker">Founding administrator</span><h3>Set your first Staff password</h3><StaffSetupForm /></div> : null}
          <p className="staff-login-footnote">Flight simulation only · Independent virtual airline · Not affiliated with British Airways Plc</p>
        </div>
      </section>
    </main>
  );
}
