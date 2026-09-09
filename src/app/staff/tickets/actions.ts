"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffPermission } from "@/lib/staff-auth";
import { getStaffState } from "@/lib/staff-store";
import { addTicketMessage, getTicket, saveTicketAttachments, updateTicket, type TicketPriority, type TicketStatus } from "@/lib/ticket-store";

export async function staffReplyToTicket(ticketId: string, formData: FormData) {
  const session = await requireStaffPermission("support.reply");
  const ticket = await getTicket(ticketId);
  if (!ticket) redirect("/staff/tickets");
  const body = String(formData.get("message") ?? "").trim().slice(0, 8000);
  if (!body) return;
  const internal = formData.get("internal") === "on";
  const attachments = await saveTicketAttachments(ticket.number, formData.getAll("attachments").filter((item): item is File => item instanceof File));
  await addTicketMessage(ticket.id, { authorType: "staff", authorId: session.userId, authorName: session.name, body, internal, attachments });
  revalidatePath(`/staff/tickets/${ticket.id}`);
  revalidatePath(`/support/tickets/${ticket.id}`);
  revalidatePath("/staff/tickets");
}

export async function updateStaffTicket(ticketId: string, formData: FormData) {
  const status = String(formData.get("status") ?? "open") as TicketStatus;
  const priority = String(formData.get("priority") ?? "normal") as TicketPriority;
  const assignedStaffId = String(formData.get("assignedStaffId") ?? "").trim();
  await requireStaffPermission("support.assign");
  if (status === "resolved" || status === "closed") await requireStaffPermission("support.close");
  const state = await getStaffState();
  const assignee = assignedStaffId ? state.users.find((user) => user.id === assignedStaffId && user.status === "active") : null;
  await updateTicket(ticketId, {
    status,
    priority,
    assignedStaffId: assignee?.id ?? null,
    assignedStaffName: assignee?.name ?? null,
  });
  revalidatePath(`/staff/tickets/${ticketId}`);
  revalidatePath(`/support/tickets/${ticketId}`);
  revalidatePath("/staff/tickets");
}
