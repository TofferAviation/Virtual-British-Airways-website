import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { InviteAcceptForm } from "./InviteAcceptForm";

export default async function StaffInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
          <span className="section-kicker">Staff invitation</span>
          <h1>Join the British Airways Virtual staff team.</h1>
          <p>Create your staff password to activate the role that was assigned to you. Staff permissions are separate from your normal pilot account.</p>
          <div className="staff-login-security">
            <strong>Your pilot account stays separate</strong>
            <p>Removing staff access later will not delete or deactivate your British Airways Virtual pilot account.</p>
          </div>
        </div>
        <div className="staff-login-card">
          <span className="section-kicker">Accept invitation</span>
          <h2>Activate staff access</h2>
          <InviteAcceptForm token={token} />
          <p className="staff-login-footnote">Flight simulation only · Independent virtual airline · Not affiliated with British Airways Plc</p>
        </div>
      </section>
    </main>
  );
}
