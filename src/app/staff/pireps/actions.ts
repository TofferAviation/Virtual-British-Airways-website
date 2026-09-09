"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffPermission } from "@/lib/staff-auth";
import { reviewPirep } from "@/lib/pilot-operations-store";

export async function reviewPirepAction(formData: FormData) {
  const session = await requireStaffPermission("routes.edit");
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "") as "accepted" | "rejected" | "changes_requested";
  const comments = String(formData.get("comments") ?? "");
  if (!id || !["accepted", "rejected", "changes_requested"].includes(decision)) redirect("/staff/pireps");
  try {
    await reviewPirep({ id, decision, staffName: session.name, comments });
  } catch {
    redirect("/staff/pireps?error=review");
  }
  revalidatePath("/staff/pireps");
  revalidatePath("/account");
  redirect(`/staff/pireps?reviewed=${decision}`);
}
