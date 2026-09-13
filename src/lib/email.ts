import nodemailer from "nodemailer";
import type { PublicPilotAccount } from "@/lib/pilot-store";

const DEFAULT_SITE_URL = "https://britishairwaysva.co.uk";
const DEFAULT_FROM = "British Airways Virtual <support@britishairwaysva.co.uk>";
const DEFAULT_REPLY_TO = "support@britishairwaysva.co.uk";

type EmailDelivery = "sent" | "not-configured" | "failed";

type SmtpDeliveryError = {
  code?: unknown;
  responseCode?: unknown;
  command?: unknown;
};

function siteUrl() {
  const value = (process.env.BAV_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL).trim().replace(/\/$/, "");
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") throw new Error("not HTTPS");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function emailConfig() {
  const user = process.env.BAV_SMTP_USER?.trim();
  const password = process.env.BAV_SMTP_PASSWORD?.replace(/\s/g, "");
  if (!user || !password) return null;

  const port = Number(process.env.BAV_SMTP_PORT ?? 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const secure = (process.env.BAV_SMTP_SECURE ?? "true").trim().toLowerCase() !== "false";
  return {
    host: process.env.BAV_SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    secure,
    auth: { user, pass: password },
    from: process.env.BAV_EMAIL_FROM?.trim() || DEFAULT_FROM,
    replyTo: process.env.BAV_EMAIL_REPLY_TO?.trim() || DEFAULT_REPLY_TO,
  };
}

/** Safe for the public health endpoint: exposes no passwords or addresses. */
export function emailDeliveryHealth() {
  const config = emailConfig();
  return {
    configured: Boolean(config),
    host: config?.host ?? null,
    port: config?.port ?? null,
    secure: config?.secure ?? null,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

async function sendEmail(input: { to: string; subject: string; text: string; html: string }): Promise<EmailDelivery> {
  const config = emailConfig();
  if (!config) return "not-configured";

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
    await transporter.sendMail({
      from: config.from,
      to: input.to,
      replyTo: config.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return "sent";
  } catch (error) {
    // Do not log message content, recipient addresses, SMTP credentials, or
    // password-reset links. The delivery outcome remains intentionally generic.
    const smtpError = error as SmtpDeliveryError;
    console.error("BAV email delivery failed", {
      name: error instanceof Error ? error.name : "unknown error",
      code: typeof smtpError.code === "string" ? smtpError.code : null,
      responseCode: typeof smtpError.responseCode === "number" ? smtpError.responseCode : null,
      command: typeof smtpError.command === "string" ? smtpError.command : null,
    });
    return "failed";
  }
}

function emailShell(title: string, body: string) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#eef3f8;font-family:Arial,sans-serif;color:#10243f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #d5e0eb"><tr><td style="padding:28px 32px;background:#071d49;color:#fff"><div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#83c8ff">British Airways Virtual</div><h1 style="margin:10px 0 0;font-family:Georgia,serif;font-size:30px;font-weight:400">${title}</h1></td></tr><tr><td style="padding:30px 32px;font-size:15px;line-height:1.6">${body}</td></tr><tr><td style="padding:16px 32px;border-top:1px solid #dce5ee;color:#63768d;font-size:11px;line-height:1.5">Flight simulation only · Independent virtual airline project · Not affiliated with British Airways Plc</td></tr></table></td></tr></table></body></html>`;
}

function actionLink(label: string, href: string) {
  return `<p style="margin:25px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#075aaa;color:#fff;padding:13px 19px;text-decoration:none;font-weight:700">${escapeHtml(label)}</a></p>`;
}

export function publicWebsiteUrl() {
  return siteUrl();
}

export async function sendPilotWelcomeEmail(pilot: PublicPilotAccount | Pick<PublicPilotAccount, "name" | "email" | "pilotNumber">) {
  const name = escapeHtml(pilot.name);
  const accountUrl = `${siteUrl()}/account`;
  return sendEmail({
    to: pilot.email,
    subject: `Welcome to British Airways Virtual, ${pilot.name}`,
    text: `Welcome to British Airways Virtual, ${pilot.name}. Your pilot reference is ${pilot.pilotNumber}. You can now book a flight, manage your profile, and submit PIREPs at ${accountUrl}.`,
    html: emailShell("Welcome aboard", `<p>Welcome to British Airways Virtual, ${name}.</p><p>Your pilot reference is <strong>${escapeHtml(pilot.pilotNumber)}</strong>. Your account is ready for flight bookings, PIREPs and your virtual airline career.</p>${actionLink("Open your BAV account", accountUrl)}`),
  });
}

export async function sendPilotPasswordResetEmail(input: { name: string; email: string; token: string }) {
  const resetUrl = `${siteUrl()}/reset-password?token=${encodeURIComponent(input.token)}`;
  return sendEmail({
    to: input.email,
    subject: "Reset your British Airways Virtual password",
    text: `Hello ${input.name}, use this link to reset your British Airways Virtual password: ${resetUrl}\n\nThe link expires in one hour. If you did not request it, you can ignore this email.`,
    html: emailShell("Reset your password", `<p>Hello ${escapeHtml(input.name)},</p><p>We received a request to reset your British Airways Virtual password. This link is single-use and expires in one hour.</p>${actionLink("Reset password", resetUrl)}<p style="color:#63768d;font-size:12px">If you did not request this, you can safely ignore this email.</p>`),
  });
}

export async function sendStaffInvitationEmail(input: { name: string; email: string; roleName: string; invitationUrl: string; message?: string }) {
  const message = input.message?.trim() ? `<p>${escapeHtml(input.message.trim())}</p>` : "";
  return sendEmail({
    to: input.email,
    subject: "You have been invited to the British Airways Virtual Staff Centre",
    text: `Hello ${input.name}, you have been invited to the British Airways Virtual Staff Centre as ${input.roleName}. Set your password and accept your invitation: ${input.invitationUrl}\n\nThis invitation expires in seven days.${input.message?.trim() ? `\n\nMessage from the team: ${input.message.trim()}` : ""}`,
    html: emailShell("Staff Centre invitation", `<p>Hello ${escapeHtml(input.name)},</p><p>You have been invited to the British Airways Virtual Staff Centre as <strong>${escapeHtml(input.roleName)}</strong>.</p>${message}${actionLink("Accept staff invitation", input.invitationUrl)}<p style="color:#63768d;font-size:12px">This single-use invitation expires in seven days.</p>`),
  });
}
