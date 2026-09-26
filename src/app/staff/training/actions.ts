"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { approveTrainingApplication, completeQualificationRecurrent, manuallyIssueQualification, markTrainingModuleComplete, reviewTrainingCheck, updateQualificationDefinition } from "@/lib/pilot-career";
import { requireStaffPermission } from "@/lib/staff-auth";

function returnToTraining(result: string) {
  revalidatePath("/staff/training");
  revalidatePath("/account/career");
  revalidatePath("/account/qualifications");
  revalidatePath("/account/finances");
  redirect(`/staff/training?updated=${result}`);
}

export async function approveTrainingAction(formData: FormData) {
  const staff = await requireStaffPermission("users.edit");
  const applicationId = String(formData.get("applicationId") ?? "");
  try {
    await approveTrainingApplication(applicationId, staff.name, String(formData.get("note") ?? ""), String(formData.get("instructor") ?? ""));
  } catch {
    redirect("/staff/training?error=approve");
  }
  returnToTraining("approved");
}

export async function completeTrainingModuleAction(formData: FormData) {
  const staff = await requireStaffPermission("users.edit");
  try {
    await markTrainingModuleComplete(String(formData.get("applicationId") ?? ""), String(formData.get("moduleId") ?? ""), staff.name);
  } catch {
    redirect("/staff/training?error=module");
  }
  returnToTraining("module");
}

export async function reviewTrainingCheckAction(formData: FormData) {
  const staff = await requireStaffPermission("users.edit");
  const outcome = String(formData.get("outcome") ?? "");
  if (outcome !== "passed" && outcome !== "failed" && outcome !== "retry") redirect("/staff/training?error=check");
  try {
    await reviewTrainingCheck(String(formData.get("applicationId") ?? ""), outcome, staff.name, String(formData.get("note") ?? ""), String(formData.get("checkFlightPirepId") ?? "").trim() || null);
  } catch {
    redirect("/staff/training?error=check");
  }
  returnToTraining("check");
}

export async function manuallyIssueQualificationAction(formData: FormData) {
  const staff = await requireStaffPermission("users.edit");
  try {
    await manuallyIssueQualification({ pilotId: String(formData.get("pilotId") ?? ""), definitionId: String(formData.get("definitionId") ?? ""), staffMember: staff.name, source: String(formData.get("source") ?? "") === "grandfathered" ? "grandfathered" : "manual", reason: String(formData.get("reason") ?? "") });
  } catch {
    redirect("/staff/training?error=issue");
  }
  returnToTraining("issued");
}

export async function completeRecurrentTrainingAction(formData: FormData) {
  const staff = await requireStaffPermission("users.edit");
  try {
    await completeQualificationRecurrent(String(formData.get("qualificationId") ?? ""), staff.name, String(formData.get("note") ?? ""), String(formData.get("checkFlightPirepId") ?? "").trim() || null);
  } catch {
    redirect("/staff/training?error=recurrent");
  }
  returnToTraining("recurrent");
}

export async function saveQualificationDefinitionAction(formData: FormData) {
  const staff = await requireStaffPermission("settings.edit");
  const definitionId = String(formData.get("definitionId") ?? "").trim();
  try {
    await updateQualificationDefinition(definitionId, {
      name: formData.get("name"),
      description: formData.get("description"),
      variants: formData.get("variants"),
      trainingModules: formData.get("trainingModules"),
      virtualTrainingCost: formData.get("virtualTrainingCost"),
      recurrentTrainingCost: formData.get("recurrentTrainingCost"),
      minimumRank: formData.get("minimumRank"),
      minimumHours: formData.get("minimumHours"),
      minimumSectors: formData.get("minimumSectors"),
      prerequisite: formData.get("prerequisite"),
      requiresValidTypeRating: formData.get("requiresValidTypeRating"),
      validityMonths: formData.get("validityMonths"),
      recurrentIntervalMonths: formData.get("recurrentIntervalMonths"),
      checkFlightRequired: formData.get("checkFlightRequired"),
      staffApprovalRequired: formData.get("staffApprovalRequired"),
      available: formData.get("available"),
      displayOrder: formData.get("displayOrder"),
    }, staff.name);
  } catch {
    redirect("/staff/training?error=programme");
  }
  revalidatePath("/staff/training");
  revalidatePath("/account/career");
  revalidatePath("/account/qualifications");
  redirect("/staff/training?updated=programme");
}
