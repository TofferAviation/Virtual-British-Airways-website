import { NextRequest, NextResponse } from "next/server";

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() ?? "";
}

function hostnameFromAuthority(authority: string) {
  const value = authority.trim().toLowerCase();
  if (!value) return "";
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end >= 0 ? value.slice(1, end) : value;
  }
  return value.split(":", 1)[0];
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function isDirectLocalRequest(request: NextRequest) {
  // Cloudflare adds these headers when the browser reached us through a tunnel.
  // In that case the local origin may still appear as localhost internally, but
  // the request is external and must not bypass preview protection.
  if (
    request.headers.get("cf-ray") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("cf-visitor")
  ) {
    return false;
  }

  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  if (forwardedHost) return isLocalHostname(hostnameFromAuthority(forwardedHost));

  const host = firstHeaderValue(request.headers.get("host"));
  if (host) return isLocalHostname(hostnameFromAuthority(host));

  return isLocalHostname(request.nextUrl.hostname.toLowerCase());
}

export function requestUsesHttps(request: NextRequest) {
  if (isDirectLocalRequest(request)) return false;

  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto")).toLowerCase();
  if (forwardedProto) return forwardedProto === "https";

  const cfVisitor = request.headers.get("cf-visitor")?.toLowerCase() ?? "";
  if (cfVisitor.includes('"scheme":"https"')) return true;

  return request.nextUrl.protocol === "https:";
}

export function relativeRedirect(location: string, status = 303) {
  if (!location.startsWith("/") || location.startsWith("//")) {
    throw new Error("relativeRedirect requires an origin-relative path.");
  }

  return new NextResponse(null, {
    status,
    headers: { Location: location },
  });
}
