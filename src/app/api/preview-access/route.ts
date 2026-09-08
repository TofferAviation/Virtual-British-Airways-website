import { NextRequest } from "next/server";
import {
  PREVIEW_ACCESS_COOKIE,
  getPreviewAccessToken,
  getPreviewPassword,
  previewProtectionEnabled,
} from "@/lib/preview-access";
import { relativeRedirect, requestUsesHttps } from "@/lib/request-context";

function safeNextPath(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/preview-access")) return "/";
  return next;
}

function accessPageLocation(error: "invalid" | "config", nextPath: string) {
  const params = new URLSearchParams({ error, next: nextPath });
  return `/preview-access?${params.toString()}`;
}

export async function POST(request: NextRequest) {
  if (!previewProtectionEnabled()) {
    return relativeRedirect("/", 303);
  }

  const formData = await request.formData();
  const suppliedPassword = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(formData.get("next"));
  const configuredPassword = getPreviewPassword();

  if (!configuredPassword) {
    return relativeRedirect(accessPageLocation("config", nextPath), 303);
  }

  if (suppliedPassword !== configuredPassword) {
    return relativeRedirect(accessPageLocation("invalid", nextPath), 303);
  }

  const token = await getPreviewAccessToken(configuredPassword);
  const response = relativeRedirect(nextPath, 303);
  response.cookies.set(PREVIEW_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
