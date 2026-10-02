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

  return request.nextUrl.protocol === "https:";
}

const BAV_SESSION_DOMAINS = ["virtualairline.co.uk", "britishairwaysva.co.uk"];

function configuredPublicHostname() {
  const value = (process.env.BAV_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Share one BAV account session between each approved public root domain and
 * its www hostname. Local development and temporary Render URLs stay host-only.
 * The live virtualairline.co.uk domain is listed explicitly so a stale hosting
 * environment value cannot reintroduce a split root/www login session.
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
  const configuredDomain = configuredPublicHostname();
  const approvedDomains = configuredDomain
    ? [...new Set([...BAV_SESSION_DOMAINS, configuredDomain])]
    : BAV_SESSION_DOMAINS;
  return approvedDomains.find((domain) => hosts.some((host) => host === domain || host.endsWith(`.${domain}`)));
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
