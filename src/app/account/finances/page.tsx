import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getCareerDashboard } from "@/lib/pilot-career";
import { requirePilotSession } from "@/lib/pilot-auth";
import { reconcileAcceptedPirepFinance } from "@/lib/pilot-operations-store";
import { getPilotById } from "@/lib/pilot-store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pilot Finances" };
const money = (value: number) => `${value >= 0 ? "+" : "−"}£${Math.abs(value).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function PilotFinancesPage() {
  const session = await requirePilotSession();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot) redirect("/login");
  const reconciliation = await reconcileAcceptedPirepFinance(pilot.id);
  const career = await getCareerDashboard(pilot);
  return <><SiteHeader /><main className="career-page"><div className="career-shell"><nav className="career-breadcrumbs"><Link href="/account">Pilot account</Link><span>›</span><Link href="/account/career">Career</Link><span>›</span><strong>Pilot finances</strong></nav><header className="career-hero"><div><span>VIRTUAL FINANCES</span><h1>Pilot finances</h1><p>Your private British Airways Virtual account ledger. This is fictional virtual currency and not real salary, pay, or a payment account.</p></div><Link href="/account/career">Career overview →</Link></header>{reconciliation.posted ? <p className="career-feedback success" role="status">{reconciliation.posted} accepted {reconciliation.posted === 1 ? "PIREP has" : "PIREP reports have"} now been credited to your virtual account.</p> : null}{reconciliation.failed ? <p className="career-feedback error" role="alert">We could not finalise {reconciliation.failed} accepted {reconciliation.failed === 1 ? "PIREP" : "PIREP reports"} yet. The system will retry automatically; Operations can also check the finance ledger.</p> : null}<section className="career-metrics"><article><span>Current balance</span><strong>{money(career.finance.currentBalance).replace("+", "")}</strong><small>Available virtual account balance</small></article><article><span>This month</span><strong>{money(career.finance.currentMonthEarnings)}</strong><small>Virtual earnings posted this month</small></article><article><span>Lifetime earnings</span><strong>{money(career.finance.lifetimeEarnings)}</strong><small>All credited virtual flight income</small></article><article><span>Training expenditure</span><strong>{money(career.transactions.filter((transaction) => transaction.amount < 0).reduce((total, transaction) => total + transaction.amount, 0))}</strong><small>Posted virtual training and adjustments</small></article></section><section className="career-card"><div className="career-card-head"><div><span>TRANSACTION LEDGER</span><h2>Recent transactions</h2></div></div>{career.transactions.length ? <div className="career-ledger">{career.transactions.map((transaction) => <article key={transaction.id}><time>{new Date(transaction.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</time><div><strong>{transaction.description}</strong><span>{transaction.category.replaceAll("_", " ")} · {transaction.createdAutomatically ? "Automatic" : "Pilot / staff action"}</span></div><b className={transaction.amount > 0 ? "positive" : "negative"}>{money(transaction.amount)}</b><small>Balance {money(transaction.balanceAfter).replace("+", "")}</small></article>)}</div> : <div className="career-empty"><strong>No virtual transactions yet</strong><span>Accepted PIREPs will create an itemised virtual flight-pay entry here.</span></div>}</section></div></main><SiteFooter /></>;
}
