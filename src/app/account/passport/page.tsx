import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { VirtualPassport } from "@/components/VirtualPassport";
import { requirePilotSession } from "@/lib/pilot-auth";
import { listPilotPireps } from "@/lib/pilot-operations-store";
import { getPilotById } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Virtual passport" };

export default async function PassportPage() {
  const session = await requirePilotSession();
  const account = await getPilotById(session.pilotId);
  if (!account) redirect("/login");
  const pireps = await listPilotPireps(account.id);

  return <main className="account-v2-page">
    <header className="account-v2-header">
      <nav className="account-v2-nav" aria-label="Pilot account navigation"><Link href="/destinations">Discover</Link><Link href="/book">Book</Link><Link href="/account">Manage</Link><Link href="/support/tickets">Support</Link></nav>
      <Link className="account-v2-brand" href="/" aria-label="British Airways Virtual home"><BrandLogo variant="white" priority /></Link>
      <div className="account-v2-header-actions"><span className="account-v2-pilot"><span className="account-v2-user-icon" aria-hidden="true" />{account.name}</span><Link href="/account" className="account-v2-logout">Dashboard</Link></div>
    </header>
    <section className="account-v2-main account-v2-passport-page"><div className="account-v2-container">
      <Link className="account-v2-back-link" href="/account">← Back to pilot dashboard</Link>
      <VirtualPassport pireps={pireps} />
    </div></section>
  </main>;
}
