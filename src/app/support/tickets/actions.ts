"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pilot } from "@/lib/mockData";
import { addTicketMessage, createTicket, getTicket, saveTicketAttachments, type TicketCategory } from "@/lib/ticket-store";

async function requirePilot() {
  const store = await cookies();
  if (store.get("bav_demo_session")?.value !== "1") redirect("/login");
}

export async function createPilotTicket(formData: FormData) {
  await requirePilot();
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 120);
  const body = String(formData.get("message") ?? "").trim().slice(0, 8000);
  const category = String(formData.get("category") ?? "other") as TicketCategory;
  if (!subject || !body) redirect("/support/tickets/new?error=required");
  const ticket = await createTicket({ pilotId: pilot.id, pilotName: pilot.name, subject, body, category });
  const attachments = await saveTicketAttachments(ticket.number, formData.getAll("attachments").filter((item): item is File => item instanceof File));
  if (attachments.length) {
    ticket.messages[0].attachments = attachments;
    // Re-save through the message store by appending is unnecessary; the first message is already in memory only.
    // Add a small attachment-only note so persisted metadata remains available without exposing internal storage details.
    await addTicketMessage(ticket.id, { authorType: "pilot", authorId: pilot.id, authorName: pilot.name, body: "Attachments added to this ticket.", internal: false, attachments });
  }
  redirect(`/support/tickets/${ticket.id}`);
}

export async function replyToPilotTicket(ticketId: string, formData: FormData) {
  await requirePilot();
  const ticket = await getTicket(ticketId);
  if (!ticket || ticket.pilotId !== pilot.id) redirect("/support/tickets");
  const body = String(formData.get("message") ?? "").trim().slice(0, 8000);
  if (!body) redirect(`/support/tickets/${ticketId}?error=required`);
  const attachments = await saveTicketAttachments(ticket.number, formData.getAll("attachments").filter((item): item is File => item instanceof File));
  await addTicketMessage(ticket.id, { authorType: "pilot", authorId: pilot.id, authorName: pilot.name, body, internal: false, attachments });
  revalidatePath(`/support/tickets/${ticket.id}`);
  revalidatePath("/support/tickets");
}
