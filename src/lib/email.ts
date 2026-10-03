import nodemailer from "nodemailer";
import type { PublicPilotAccount } from "@/lib/pilot-store";

const DEFAULT_SITE_URL = "https://virtualairline.co.uk";
const DEFAULT_FROM = "British Airways Virtual <support@britishairwaysva.co.uk>";
const DEFAULT_REPLY_TO = "support@britishairwaysva.co.uk";
const DEFAULT_PRIVATE_PREVIEW_FROM = "Private Aviation Preview <no-reply@britishairwaysva.co.uk>";
const DEFAULT_PRIVATE_PREVIEW_REPLY_TO = "no-reply@britishairwaysva.co.uk";

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

function envValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function envPassword(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value?.trim()) return value.replace(/\s/g, "");
  }
  return undefined;
}

function emailConfig() {
  // BAV_* is the documented configuration. The fallback names make this
  // release compatible with a standard SMTP configuration already present on
  // the Render service without weakening how credentials are handled.
  const user = envValue("BAV_SMTP_USER", "SMTP_USER", "EMAIL_USER");
  const password = envPassword("BAV_SMTP_PASSWORD", "SMTP_PASSWORD", "EMAIL_PASSWORD", "GMAIL_APP_PASSWORD");
  if (!user || !password) return null;

  const port = Number(envValue("BAV_SMTP_PORT", "SMTP_PORT", "EMAIL_PORT") ?? 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const secure = (envValue("BAV_SMTP_SECURE", "SMTP_SECURE", "EMAIL_SECURE") ?? "true").toLowerCase() !== "false";
  return {
    host: envValue("BAV_SMTP_HOST", "SMTP_HOST", "EMAIL_HOST") || "smtp.gmail.com",
    port,
    secure,
    auth: { user, pass: password },
    from: envValue("BAV_EMAIL_FROM", "EMAIL_FROM") || DEFAULT_FROM,
    replyTo: envValue("BAV_EMAIL_REPLY_TO", "EMAIL_REPLY_TO") || DEFAULT_REPLY_TO,
  };
}

function privatePreviewEmailConfig() {
  return {
    from: envValue("BAV_CLOSED_BETA_EMAIL_FROM", "BAV_PASSWORD_RESET_FROM") || DEFAULT_PRIVATE_PREVIEW_FROM,
    replyTo: envValue("BAV_CLOSED_BETA_EMAIL_REPLY_TO", "BAV_PASSWORD_RESET_REPLY_TO") || DEFAULT_PRIVATE_PREVIEW_REPLY_TO,
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

async function sendEmail(input: { to: string; subject: string; text: string; html: string; from?: string; replyTo?: string | null }): Promise<EmailDelivery> {
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
      from: input.from ?? config.from,
      to: input.to,
      replyTo: input.replyTo === undefined ? config.replyTo : input.replyTo ?? undefined,
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

function privatePreviewEmailShell(title: string, body: string) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#07101f;font-family:Arial,sans-serif;color:#eaf0f8"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#0c1730;border:1px solid #405070"><tr><td style="padding:28px 32px;background:linear-gradient(120deg,#07142e,#3b1742);color:#fff"><div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#c5d4ec">Private aviation preview</div><h1 style="margin:10px 0 0;font-family:Georgia,serif;font-size:30px;font-weight:400">${title}</h1></td></tr><tr><td style="padding:30px 32px;font-size:15px;line-height:1.6;color:#eaf0f8">${body}</td></tr><tr><td style="padding:16px 32px;border-top:1px solid #33435f;color:#afbdd2;font-size:11px;line-height:1.5">Private preview · This message was sent for account security.</td></tr></table></td></tr></table></body></html>`;
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

function closedBetaAgreementText() {
  return `CLOSED BETA CONFIDENTIALITY AGREEMENT

1. Welcome and early access
You are receiving early access to the British Airways Virtual closed beta. Features, systems, pages and applications may change, be removed, be unavailable or contain errors before public release.

2. Confidentiality
All non-public beta information is confidential. This includes screenshots and video; user-interface designs and unreleased pages; Ember, Res2 iPort/DCS, fleet, cabin, passenger and internal operations systems; source code, APIs and technical details; plans, roadmaps, test builds, staff communications, beta announcements, bugs, discussions, and login or access information.

3. Screenshots, video and streaming
Do not publish, distribute, stream, upload, forward or otherwise share any non-public beta material without written permission from the British Airways Virtual team. This includes public screenshots, videos, livestreams, social posts, public Discord messages and public screen sharing. Material the team has already officially made public is excluded.

4. Personal access and account security
Your access is issued to you personally. Do not share your account, password, builds, files or access with another person, and do not attempt to bypass access restrictions.

5. Testing and feedback
Please report bugs, crashes, broken or missing features, usability issues, incorrect data and suggestions. You keep ownership of your feedback, and grant the team permission to use it to improve the project without compensation.

6. Beta software and data
The beta is for testing only. It may contain bugs, crashes, incomplete features, incorrect information, data loss or unexpected changes. Do not rely on it for permanent data storage or critical information.

7. Intellectual property and third-party brands
All beta designs, software, code, systems, assets and documentation remain the property of British Airways Virtual. Do not copy, redistribute, republish, sell, modify, reverse engineer or use beta material outside the agreed testing purpose. This is an independent flight-simulation and virtual-airline project; it is not affiliated with, endorsed by or employed by British Airways Plc or its affiliates.

8. Virtual systems
Virtual currency, credits, ranks, achievements, careers and similar in-project systems have no real-world monetary value and cannot be exchanged for money, goods or services.

9. Security and responsible testing
Do not bypass authentication, access another person's account, extract data that does not belong to you, disrupt systems or exploit vulnerabilities. Report any security concern privately to the team.

10. Removal of access
Access may be removed at any time. Confidentiality obligations continue after access is removed or the beta ends.

11. No employment relationship
Participation is voluntary and does not create employment, wages, benefits, partnership or any other legal relationship.

Acceptance
By signing in to or continuing to use the closed beta after receiving this invitation, you confirm that you have read and agree to these terms.`;
}

function closedBetaAgreementHtml() {
  const heading = "margin:25px 0 7px;font-size:16px;line-height:1.3;color:#10243f";
  const paragraph = "margin:0 0 13px";
  return `<div style="margin:26px 0 0;padding:22px 20px;background:#f4f7fb;border:1px solid #d5e0eb"><div style="font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#075aaa">Closed beta confidentiality agreement</div><h2 style="margin:8px 0 16px;font-family:Georgia,serif;font-size:24px;font-weight:400;color:#10243f">Private testing terms</h2><h3 style="${heading}">1. Welcome and early access</h3><p style="${paragraph}">You are receiving early access to the British Airways Virtual closed beta. Features, systems, pages and applications may change, be removed, be unavailable or contain errors before public release.</p><h3 style="${heading}">2. Confidentiality</h3><p style="${paragraph}">All non-public beta information is confidential. This includes screenshots and video; user-interface designs and unreleased pages; Ember, Res2 iPort/DCS, fleet, cabin, passenger and internal operations systems; source code, APIs and technical details; plans, roadmaps, test builds, staff communications, beta announcements, bugs, discussions, and login or access information.</p><h3 style="${heading}">3. Screenshots, video and streaming</h3><p style="${paragraph}">Do not publish, distribute, stream, upload, forward or otherwise share non-public beta material without written permission from the British Airways Virtual team. This includes public screenshots, videos, livestreams, social posts, public Discord messages and public screen sharing. Material the team has already officially made public is excluded.</p><h3 style="${heading}">4. Personal access and account security</h3><p style="${paragraph}">Your access is issued to you personally. Do not share your account, password, builds, files or access with another person, and do not attempt to bypass access restrictions.</p><h3 style="${heading}">5. Testing and feedback</h3><p style="${paragraph}">Please report bugs, crashes, broken or missing features, usability issues, incorrect data and suggestions. You keep ownership of your feedback, and grant the team permission to use it to improve the project without compensation.</p><h3 style="${heading}">6. Beta software and data</h3><p style="${paragraph}">The beta is for testing only. It may contain bugs, crashes, incomplete features, incorrect information, data loss or unexpected changes. Do not rely on it for permanent data storage or critical information.</p><h3 style="${heading}">7. Intellectual property and third-party brands</h3><p style="${paragraph}">All beta designs, software, code, systems, assets and documentation remain the property of British Airways Virtual. Do not copy, redistribute, republish, sell, modify, reverse engineer or use beta material outside the agreed testing purpose. This is an independent flight-simulation and virtual-airline project; it is not affiliated with, endorsed by or employed by British Airways Plc or its affiliates.</p><h3 style="${heading}">8. Virtual systems</h3><p style="${paragraph}">Virtual currency, credits, ranks, achievements, careers and similar in-project systems have no real-world monetary value and cannot be exchanged for money, goods or services.</p><h3 style="${heading}">9. Security and responsible testing</h3><p style="${paragraph}">Do not bypass authentication, access another person&rsquo;s account, extract data that does not belong to you, disrupt systems or exploit vulnerabilities. Report any security concern privately to the team.</p><h3 style="${heading}">10. Removal of access</h3><p style="${paragraph}">Access may be removed at any time. Confidentiality obligations continue after access is removed or the beta ends.</p><h3 style="${heading}">11. No employment relationship</h3><p style="${paragraph}">Participation is voluntary and does not create employment, wages, benefits, partnership or any other legal relationship.</p><div style="margin-top:22px;padding:15px 16px;border-left:3px solid #d71944;background:#fff"><strong>Acceptance</strong><br />By signing in to or continuing to use the closed beta after receiving this invitation, you confirm that you have read and agree to these terms.</div></div>`;
}

export async function sendClosedBetaInvitationEmail(input: { name: string; email: string; pilotNumber: string; temporaryPassword: string }) {
  const loginUrl = `${siteUrl()}/closed-beta`;
  const name = escapeHtml(input.name);
  const pilotNumber = escapeHtml(input.pilotNumber);
  const email = escapeHtml(input.email);
  const temporaryPassword = escapeHtml(input.temporaryPassword);
  return sendEmail({
    to: input.email,
    subject: "Your closed-beta invitation and confidentiality agreement",
    text: `Hello ${input.name},\n\nYou have been invited to the British Airways Virtual closed beta. Your access is personal and should not be shared.\n\nPilot reference: ${input.pilotNumber}\nEmail: ${input.email}\nTemporary password: ${input.temporaryPassword}\n\nSign in at ${loginUrl}. Please change this temporary password from Account settings after you sign in.\n\nBefore you continue, please read the agreement below. By signing in to or continuing to use the closed beta after receiving this invitation, you confirm that you have read and agree to these terms.\n\n${closedBetaAgreementText()}\n\nIf you were not expecting this invitation, you can safely ignore this email.`,
    html: emailShell("Your closed-beta invitation", `<p>Hello ${name},</p><p>You have been invited to the British Airways Virtual closed beta. Your access is personal and should not be shared.</p><div style="margin:22px 0;padding:18px 20px;background:#eef5fc;border-left:3px solid #075aaa"><strong>Pilot reference:</strong> ${pilotNumber}<br /><strong>Email:</strong> ${email}<br /><strong>Temporary password:</strong> <span style="font-family:monospace">${temporaryPassword}</span></div><p>Please change this temporary password from <strong>Account settings</strong> after you sign in. By signing in to or continuing to use the closed beta after receiving this invitation, you confirm that you have read and agree to the agreement below.</p>${closedBetaAgreementHtml()}${actionLink("Read, agree and sign in", loginUrl)}<p style="color:#63768d;font-size:12px">If you were not expecting this invitation, you can safely ignore this email.</p>`),
  });
}

export async function sendPilotPasswordResetEmail(input: { name: string; email: string; token: string; privatePreview?: boolean }) {
  const resetUrl = `${siteUrl()}${input.privatePreview ? "/closed-beta/reset-password" : "/reset-password"}?token=${encodeURIComponent(input.token)}`;
  if (input.privatePreview) {
    const delivery = privatePreviewEmailConfig();
    return sendEmail({
      to: input.email,
      from: delivery.from,
      replyTo: delivery.replyTo,
      subject: "Reset your private preview password",
      text: `Hello ${input.name}, use this link to reset your private preview password: ${resetUrl}\n\nThe link expires in one hour. If you did not request it, you can ignore this email.`,
      html: privatePreviewEmailShell("Reset your password", `<p>Hello ${escapeHtml(input.name)},</p><p>We received a request to reset your private preview password. This link is single-use and expires in one hour.</p>${actionLink("Reset password", resetUrl)}<p style="color:#afbdd2;font-size:12px">If you did not request this, you can safely ignore this email.</p>`),
    });
  }

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
