"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";
import { addTicketMessage, createTicket, getTicket, saveTicketAttachments, type TicketCategory } from "@/lib/ticket-store";

async function requirePilot() {
  const session = await requirePilotSession();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot) redirect("/login");
  return pilot;
}

export async function createPilotTicket(formData: FormData) {
  const pilot = await requirePilot();
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 120);
  const body = String(formData.get("message") ?? "").trim().slice(0, 8000);
  const category = String(formData.get("category") ?? "other") as TicketCategory;
  if (!subject || !body) redirect("/support/tickets/new?error=required");
  const ticket = await createTicket({ pilotId: pilot.id, pilotName: pilot.name, subject, body, category });
  const attachments = await saveTicketAttachments(ticket.number, formData.getAll("attachments").filter((item): item is File => item instanceof File));
  if (attachments.length) {
    await addTicketMessage(ticket.id, { authorType: "pilot", authorId: pilot.id, authorName: pilot.name, body: "Attachments added to this ticket.", internal: false, attachments });
  }
  redirect(`/support/tickets/${ticket.id}`);
}

export async function replyToPilotTicket(ticketId: string, formData: FormData) {
  const pilot = await requirePilot();
  const ticket = await getTicket(ticketId);
  if (!ticket || ticket.pilotId !== pilot.id) redirect("/support/tickets");
  const body = String(formData.get("message") ?? "").trim().slice(0, 8000);
  if (!body) redirect(`/support/tickets/${ticketId}?error=required`);
  const attachments = await saveTicketAttachments(ticket.number, formData.getAll("attachments").filter((item): item is File => item instanceof File));
  await addTicketMessage(ticket.id, { authorType: "pilot", authorId: pilot.id, authorName: pilot.name, body, internal: false, attachments });
  revalidatePath(`/support/tickets/${ticket.id}`);
  revalidatePath("/support/tickets");
}
