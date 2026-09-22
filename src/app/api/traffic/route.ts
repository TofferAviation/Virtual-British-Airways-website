import { NextRequest, NextResponse } from "next/server";
import { recordSiteTraffic } from "@/lib/site-traffic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const configuredHost = process.env.BAV_PUBLIC_SITE_URL ? new URL(process.env.BAV_PUBLIC_SITE_URL).hostname : "britishairwaysva.co.uk";
    // Render forwards the public hostname to an internal HTTP request. Compare
    // hostnames (rather than the internal protocol) so real browser requests
    // remain accepted, while requests from another website are still rejected.
    return originUrl.hostname === configuredHost || originUrl.hostname === request.nextUrl.hostname;
  } catch {
    return false;
  }
}

/**
 * Use only a broad country code already supplied by a trusted hosting edge.
 * We deliberately do not read, persist, or send an IP address to a separate
 * geolocation service for first-party BAV traffic reporting.
 */
function hostingCountryCode(request: NextRequest) {
  const value = [
    request.headers.get("cf-ipcountry"),
    request.headers.get("x-vercel-ip-country"),
    request.headers.get("cloudfront-viewer-country"),
    request.headers.get("x-geo-country"),
  ].find((candidate) => typeof candidate === "string" && /^[A-Za-z]{2}$/.test(candidate.trim()));
  const code = value?.trim().toUpperCase();
  return code && code !== "XX" && code !== "T1" ? code : null;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  try {
    const body = await request.json() as { path?: unknown; visit?: unknown };
    await recordSiteTraffic(body.path, body.visit === true, hostingCountryCode(request));
  } catch {
    // Analytics must never interrupt the public website when storage is busy.
  }
  return new NextResponse(null, { status: 204 });
}
