import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePilotSession } from "@/lib/pilot-auth";
import { allianceBalances } from "@/lib/alliance";
import { allianceExportAudit, listAllianceLedger } from "@/lib/alliance-store";
export const dynamic = "force-dynamic";
const csvCell = (value: unknown) => { let s = String(value ?? ""); if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
export async function POST(request: Request) {
  const session = await requirePilotSession();
  const form = await request.formData(), format = form.get("format");
  if (form.get("consent") !== "yes" || !["json", "csv"].includes(String(format))) return NextResponse.json({ error: "Explicit download consent and a valid format are required." }, { status: 400 });
  const ledger = await listAllianceLedger(session.pilotId);
  const entries = ledger.map(e => ({ pirepId: e.pirepId, carrierId: e.carrierId, revision: e.revision, kind: e.kind, seconds: e.seconds, careerSeconds: e.careerSeconds, sectors: e.sectors, distanceNm: e.distanceNm, ...e.flight, policyVersion: e.policy.version, createdAt: e.createdAt }));
  const payload = format === "json" ? JSON.stringify({ schema: "bav-alliance-export-v1", pilotId: session.pilotId, exportedAt: new Date().toISOString(), externalSync: "disabled", banks: allianceBalances(ledger), entries }, null, 2) : [Object.keys(entries[0] ?? { pirepId: "", carrierId: "", seconds: "" }).map(csvCell).join(","), ...entries.map(e => Object.values(e).map(csvCell).join(","))].join("\r\n");
  await allianceExportAudit(session.pilotId, format as "json" | "csv", entries.length, createHash("sha256").update(payload).digest("hex"));
  return new Response(payload, { headers: { "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bav-alliance-${new Date().toISOString().slice(0, 10)}.${format}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
