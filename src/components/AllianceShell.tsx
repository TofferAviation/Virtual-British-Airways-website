import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import "@/app/alliance-operations.css";

export async function AllianceShell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <><SiteHeader /><main className="alliance-page"><header className="alliance-heading"><span>BA VIRTUAL · ALLIANCE OPERATIONS</span><h1>{title}</h1><p>{intro}</p></header><nav className="alliance-nav" aria-label="Alliance operations"><Link href="/oneworld/operations">Route explorer</Link><Link href="/account/alliance">My alliance career</Link><Link href="/account/alliance/passport">Career passport</Link><Link href="/book">BA flight selection</Link></nav>{children}<p className="alliance-disclaimer">An independent virtual aviation programme. Hours, rewards and qualifications are for simulation. Airline bank credit stays within BA Virtual; no external virtual airline account is credited automatically.</p></main><SiteFooter /></>;
}
