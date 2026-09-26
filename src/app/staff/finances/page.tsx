import { randomUUID } from "node:crypto";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { listFinanceTransactionsForStaff } from "@/lib/pilot-career";
import { listPilots } from "@/lib/pilot-store";
import { requireStaffPermission } from "@/lib/staff-auth";
import { postManualFinanceAdjustmentAction, reverseFinanceTransactionAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pilot Finance Operations" };

const money = (value: number) => `${value >= 0 ? "+" : "−"}£${Math.abs(value).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function StaffFinancesPage({ searchParams }: { searchParams: Promise<{ updated?: string; error?: string }> }) {
  await requireStaffPermission("users.edit");
  const [transactions, pilots, params] = await Promise.all([listFinanceTransactionsForStaff(), listPilots(), searchParams]);
  const pilotsById = new Map(pilots.map((pilot) => [pilot.id, pilot]));
  return <><SiteHeader /><main className="career-page"><div className="career-shell"><nav className="career-breadcrumbs"><Link href="/staff">Staff Centre</Link><span>›</span><strong>Pilot finance operations</strong></nav><header className="career-hero"><div><span>STAFF OPERATIONS</span><h1>Pilot finance operations</h1><p>Issue tightly controlled virtual adjustments or offset an existing entry. The ledger is immutable: corrections always create a new, linked transaction.</p></div><Link href="/staff/training">Training & qualifications →</Link></header>{params.updated ? <p className="career-feedback success">Finance ledger updated. The original entry remains preserved with its correction.</p> : null}{params.error ? <p className="career-feedback error">The requested finance correction was not posted. Confirm the amount, reason and current virtual balance.</p> : null}
    <section className="career-card"><div className="career-card-head"><div><span>MANUAL ADJUSTMENT</span><h2>Post an audited virtual adjustment</h2></div></div><form className="staff-training-form staff-finance-adjustment" action={postManualFinanceAdjustmentAction}><input type="hidden" name="requestId" value={randomUUID()} /><select name="pilotId" required defaultValue=""><option value="" disabled>Select pilot</option>{pilots.map((pilot) => <option key={pilot.id} value={pilot.id}>{pilot.pilotNumber} · {pilot.name}</option>)}</select><input name="amount" required type="number" min="-5000" max="5000" step="0.01" placeholder="Amount, e.g. 25 or -25" /><input name="reason" required minLength={3} maxLength={350} placeholder="Reason for correction" /><button className="career-button" type="submit">Post virtual adjustment</button></form><p className="staff-form-note">Positive amounts credit the virtual balance; negative amounts debit it. Negative corrections cannot take a pilot below £0.</p></section>
    <section className="career-card"><div className="career-card-head"><div><span>IMMUTABLE LEDGER</span><h2>Recent finance activity</h2></div></div>{transactions.length ? <div className="staff-finance-ledger">{transactions.map((transaction) => { const pilot = pilotsById.get(transaction.pilotId); const canOffset = transaction.category !== "refund" && transaction.category !== "reversal"; return <article key={transaction.id}><div><strong>{pilot ? `${pilot.pilotNumber} · ${pilot.name}` : transaction.pilotId}</strong><span>{new Date(transaction.createdAt).toLocaleString("en-GB")} · {transaction.category.replaceAll("_", " ")}</span><small>{transaction.description}</small></div><b className={transaction.amount > 0 ? "positive" : "negative"}>{money(transaction.amount)}</b>{canOffset ? <form action={reverseFinanceTransactionAction}><input type="hidden" name="transactionId" value={transaction.id} /><input name="reason" required minLength={3} maxLength={350} placeholder="Reason for refund / reversal" /><button type="submit">{transaction.amount < 0 ? "Refund" : "Reverse"}</button></form> : <em>Offset entry</em>}</article>; })}</div> : <div className="career-empty"><strong>No finance activity yet</strong><span>Accepted PIREPs, training payments and staff corrections will appear here.</span></div>}</section>
  </div></main><SiteFooter /></>;
}
