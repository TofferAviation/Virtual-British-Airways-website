"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { postManualFinanceAdjustment, reverseFinanceTransaction } from "@/lib/pilot-career";
import { requireStaffPermission } from "@/lib/staff-auth";

function returnToFinances(result: string) {
  revalidatePath("/staff/finances");
  revalidatePath("/account/career");
  revalidatePath("/account/finances");
  redirect(`/staff/finances?updated=${result}`);
}

export async function reverseFinanceTransactionAction(formData: FormData) {
  const staff = await requireStaffPermission("users.edit");
  try {
    await reverseFinanceTransaction(String(formData.get("transactionId") ?? ""), staff.name, String(formData.get("reason") ?? ""));
  } catch {
    redirect("/staff/finances?error=reverse");
  }
  returnToFinances("reversed");
}

export async function postManualFinanceAdjustmentAction(formData: FormData) {
  const staff = await requireStaffPermission("users.edit");
  try {
    await postManualFinanceAdjustment({
      pilotId: String(formData.get("pilotId") ?? ""),
      amount: Number(formData.get("amount")),
      reason: String(formData.get("reason") ?? ""),
      requestId: String(formData.get("requestId") ?? ""),
      staffMember: staff.name,
    });
  } catch {
    redirect("/staff/finances?error=adjustment");
  }
  returnToFinances("adjustment");
}
