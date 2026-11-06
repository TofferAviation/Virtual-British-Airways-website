"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffPermission } from "@/lib/staff-auth";
import { allianceAdminChange, importAllianceSchedules, reviewAlliancePirep } from "@/lib/alliance-store";
import { getPirep } from "@/lib/pilot-operations-store";
import type { AllianceReview } from "@/lib/alliance-credit";

const value = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const yes = (f: FormData, key: string) => f.get(key) === "on";
function date(value: string, optional = false) { if (optional && !value) return ""; if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("A valid ISO date is required."); return value; }
function source(value: string) { const url = new URL(value); if (url.protocol !== "https:" || value.length > 1000) throw new Error("A public HTTPS reference is required."); return value; }
export async function updateAlliance(form: FormData) {
  const staff = await requireStaffPermission("settings.edit"), action = value(form, "action");
  let message = "Alliance configuration saved.";
  try {
    if (action === "settings") {
      const milestones = value(form, "milestones").split(",").map(v => Number(v.trim()) * 3600);
      if (!milestones.length || milestones.some(n => !Number.isInteger(n) || n < 3600 || n > 360000000)) throw new Error("Milestones must be comma-separated positive hours.");
      await allianceAdminChange(staff.email, action, { enabled: yes(form, "enabled"), policy: { version: randomUUID(), career: yes(form, "career"), salary: yes(form, "salary"), points: yes(form, "points"), tierPoints: yes(form, "tierPoints"), rank: yes(form, "rank"), requireDispatchApproval: yes(form, "requireDispatchApproval"), xpPerHour: Math.min(10000, Math.max(0, Math.round(Number(value(form, "xpPerHour")) || 0))), milestones: [...new Set(milestones)].sort((a, b) => a - b) } });
    } else if (action === "import") {
      await requireStaffPermission("routes.edit");
      const json = value(form, "schedules"); if (json.length > 1_000_000) throw new Error("Import exceeds 1 MB. Split the file.");
      const count = await importAllianceSchedules(staff.email, JSON.parse(json)); message = `${count} schedules imported and audited.`;
    } else if (action === "carrier") {
      await allianceAdminChange(staff.email, action, { id: value(form, "id"), enabled: yes(form, "enabled") });
    } else if (action === "membership") {
      await allianceAdminChange(staff.email, action, { carrierId: value(form, "carrierId"), validFrom: date(value(form, "validFrom")), validUntil: date(value(form, "validUntil"), true), eligible: yes(form, "eligible"), kind: value(form, "kind") === "affiliate" ? "affiliate" : "member", sourceUrl: source(value(form, "sourceUrl")) });
    } else if (action === "affiliate") {
      const id = value(form, "id").toUpperCase(), iata = value(form, "iata").toUpperCase(), icao = value(form, "icao").toUpperCase(), name = value(form, "name");
      if (!/^[A-Z0-9_-]{2,30}$/.test(id) || !/^[A-Z0-9]{2}$/.test(iata) || !/^[A-Z]{3}$/.test(icao) || name.length < 3 || name.length > 100) throw new Error("Invalid airline identity.");
      await allianceAdminChange(staff.email, action, { id, iata, icao, name, parentId: value(form, "parentId"), sourceUrl: source(value(form, "sourceUrl")) });
    } else if (action === "dispatch") {
      await requireStaffPermission("routes.edit");
      await allianceAdminChange(staff.email, action, { bookingId: value(form, "bookingId"), approved: yes(form, "approved") });
    } else if (action === "recalculate") {
      await allianceAdminChange(staff.email, action, {}); message = "Bank projections verified from the immutable ledger. No credit was replayed.";
    } else throw new Error("Unknown configuration action.");
  } catch (error) { redirect(`/staff/alliance?error=${encodeURIComponent(error instanceof Error ? error.message : "Alliance update failed.")}`); }
  revalidatePath("/oneworld/operations"); revalidatePath("/account/alliance");
  redirect(`/staff/alliance?message=${encodeURIComponent(message)}`);
}
export async function reviewAlliance(form: FormData) {
  const staff = await requireStaffPermission("routes.edit");
  let message = "Flight report and airline bank updated.";
  try {
    const pirep = await getPirep(value(form, "pirepId")); if (!pirep) throw new Error("Report not found.");
    const decision = value(form, "decision") as AllianceReview["decision"];
    if (!["accepted", "rejected", "changes_requested", "reverse", "adjust"].includes(decision)) throw new Error("Invalid decision.");
    const expectedRevision = Number(value(form, "revision")); if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error("Invalid review revision.");
    await reviewAlliancePirep(pirep, { decision, reason: value(form, "reason"), actor: staff.email, expectedRevision, seconds: value(form, "seconds") ? Number(value(form, "seconds")) : undefined });
    if (decision === "reverse") message = "Credit reversed with an immutable audit entry.";
  } catch (error) { redirect(`/staff/alliance?error=${encodeURIComponent(error instanceof Error ? error.message : "Review failed.")}`); }
  revalidatePath("/account"); revalidatePath("/account/alliance"); revalidatePath("/staff/pireps");
  redirect(`/staff/alliance?message=${encodeURIComponent(message)}`);
}
