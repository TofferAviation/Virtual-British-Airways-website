import { NextRequest, NextResponse } from "next/server";
import {
  PREVIEW_ACCESS_COOKIE,
  getPreviewAccessToken,
  getPreviewPassword,
  previewProtectionEnabled,
} from "@/lib/preview-access";

function safeNextPath(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/preview-access")) return "/";
  return next;
}

function accessPageUrl(request: NextRequest, error: "invalid" | "config", nextPath: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/preview-access";
  url.search = "";
  url.searchParams.set("error", error);
  url.searchParams.set("next", nextPath);
  return url;
}

export async function POST(request: NextRequest) {
  if (!previewProtectionEnabled()) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home, 303);
  }

  const formData = await request.formData();
  const suppliedPassword = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(formData.get("next"));
  const configuredPassword = getPreviewPassword();

  if (!configuredPassword) {
    return NextResponse.redirect(accessPageUrl(request, "config", nextPath), 303);
  }

  if (suppliedPassword !== configuredPassword) {
    return NextResponse.redirect(accessPageUrl(request, "invalid", nextPath), 303);
  }

  const token = await getPreviewAccessToken(configuredPassword);
  const destination = request.nextUrl.clone();
  destination.pathname = nextPath.split("?", 1)[0] || "/";
  destination.search = nextPath.includes("?") ? `?${nextPath.split("?").slice(1).join("?")}` : "";

  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(PREVIEW_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
