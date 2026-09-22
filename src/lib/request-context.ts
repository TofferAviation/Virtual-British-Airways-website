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
  // Hosted platforms can route a public request to the app through an
  // internal `localhost` hop. Treat a request as local only when every host
  // signal is local; one public host means it came from a real visitor.
  const hosts = [
    firstHeaderValue(request.headers.get("x-forwarded-host")),
    firstHeaderValue(request.headers.get("host")),
    request.nextUrl.hostname,
  ]
    .map(hostnameFromAuthority)
    .filter(Boolean);

  return hosts.length > 0 && hosts.every(isLocalHostname);
}

export function requestUsesHttps(request: NextRequest) {
  if (isDirectLocalRequest(request)) return false;

  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto")).toLowerCase();
  if (forwardedProto) return forwardedProto === "https";

  return request.nextUrl.protocol === "https:";
}

/**
 * Share the one BAV account session between britishairwaysva.co.uk and its
 * www hostname. Local development and temporary Render URLs intentionally
 * remain host-only.
 */
export function pilotSessionCookieDomain(request: NextRequest) {
  const browserOrigin = firstHeaderValue(request.headers.get("origin"));
  const browserReferer = firstHeaderValue(request.headers.get("referer"));
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const hosts = [
    browserOrigin,
    browserReferer,
    forwardedHost,
    firstHeaderValue(request.headers.get("host")),
    request.nextUrl.hostname,
  ].map((value) => {
    try {
      return value.includes("://") ? new URL(value).hostname.toLowerCase() : hostnameFromAuthority(value);
    } catch {
      return "";
    }
  });
  const productionDomain = "britishairwaysva.co.uk";
  return hosts.some((host) => host === productionDomain || host.endsWith(`.${productionDomain}`))
    ? productionDomain
    : undefined;
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
