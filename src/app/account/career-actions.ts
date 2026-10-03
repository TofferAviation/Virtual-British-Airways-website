"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { applyForTypeRating, processRecurrentTrainingPayment, processTrainingPayment } from "@/lib/pilot-career";
import { getCareerRotationChoices } from "@/lib/career-paths";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById, updatePilotCareerRotation } from "@/lib/pilot-store";

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

export async function startCareerRotationAction(formData: FormData) {
  const session = await requirePilotSession();
  const rotationId = String(formData.get("rotationId") ?? "").trim();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot || !rotationId) redirect("/account/career");
  try {
    const choices = await getCareerRotationChoices(pilot);
    const choice = choices.find((item) => item.id === rotationId);
    if (!choice) throw new Error("That rotation is no longer available. Choose a current option from the live schedule.");
    await updatePilotCareerRotation(pilot.id, { ...choice, startedAt: new Date().toISOString() });
  } catch (error) {
    redirect(`/account/career?rotationError=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/account/career");
  redirect("/account/career?rotation=started");
}

export async function cancelCareerRotationAction() {
  const session = await requirePilotSession();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot) redirect("/login");
  await updatePilotCareerRotation(pilot.id, null);
  revalidatePath("/account/career");
  redirect("/account/career?rotation=ended");
}
