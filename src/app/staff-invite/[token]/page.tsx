import type { Metadata } from "next";
import Link from "next/link";
import { InviteAcceptForm } from "./InviteAcceptForm";

export const metadata: Metadata = {
  title: { absolute: "Staff invitation | Private preview" },
  description: "Accept a private-preview staff invitation.",
};

export default async function StaffInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="staff-login-page">
      <header className="staff-login-header">
        <Link className="staff-login-brand" href="/closed-beta" aria-label="Private preview sign-in">PRIVATE AVIATION PREVIEW</Link>
        <Link className="staff-login-back" href="/closed-beta">Return to sign in</Link>
      </header>
      <section className="staff-login-main">
        <div className="staff-login-copy">
          <span className="section-kicker">Staff invitation</span>
          <h1>Join the private preview team.</h1>
          <p>Activate the role assigned to your email address and choose a Staff Centre password. Your staff permissions and sign-in remain separate from your normal pilot account.</p>
          <div className="staff-login-security">
            <strong>Independent Staff Centre sign-in</strong>
            <p>Removing Staff Centre access later will not delete or deactivate your pilot account.</p>
          </div>
        </div>
        <div className="staff-login-card">
          <span className="section-kicker">Accept invitation</span>
          <h2>Activate staff access</h2>
          <InviteAcceptForm token={token} />
          <p className="staff-login-footnote">Private preview · Invitation only</p>
        </div>
      </section>
    </main>
  );
}
