"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { applyForTypeRating, processRecurrentTrainingPayment, processTrainingPayment } from "@/lib/pilot-career";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";

function message(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 180) : "The career request could not be completed.";
}

export async function applyForTrainingAction(formData: FormData) {
  const session = await requirePilotSession();
  const definitionId = String(formData.get("definitionId") ?? "").trim();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot || !definitionId) redirect("/account/qualifications?error=programme");
  try {
    await applyForTypeRating(pilot, definitionId);
  } catch (error) {
    redirect(`/account/qualifications?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/account/career");
  revalidatePath("/account/qualifications");
  redirect("/account/qualifications?applied=1");
}

export async function payForTrainingAction(formData: FormData) {
  const session = await requirePilotSession();
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot || !applicationId) redirect("/account/qualifications?error=application");
  try {
    await processTrainingPayment(pilot, applicationId);
  } catch (error) {
    redirect(`/account/qualifications?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/account/career");
  revalidatePath("/account/finances");
  revalidatePath("/account/qualifications");
  redirect("/account/qualifications?payment=1");
}

export async function payForRecurrentTrainingAction(formData: FormData) {
  const session = await requirePilotSession();
  const qualificationId = String(formData.get("qualificationId") ?? "").trim();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot || !qualificationId) redirect("/account/qualifications?error=qualification");
  try {
    await processRecurrentTrainingPayment(pilot, qualificationId);
  } catch (error) {
    redirect(`/account/qualifications?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/account/career");
  revalidatePath("/account/finances");
  revalidatePath("/account/qualifications");
  redirect("/account/qualifications?recurrent=1");
}
