import { NextRequest, NextResponse } from "next/server";
import { authenticateAuroraPartner } from "@/lib/aurora-partner-auth";
import { getRadarAuroraData } from "@/lib/radar-external";

export const dynamic = "force-dynamic";

/**
 * Read-only partner feed for the BAV-normalized NOAA SWPC OVATION Prime
 * aurora forecast. This deliberately contains no pilot, flight, Fleet or
 * account information.
 */
export async function GET(request: NextRequest) {
  const authentication = authenticateAuroraPartner(request);
  if (!authentication.ok) {
    return NextResponse.json({ error: authentication.error }, {
      status: authentication.status,
      headers: { "Cache-Control": "no-store", Vary: "Authorization, X-BAV-Aurora-Key" },
    });
  }

  return NextResponse.json(await getRadarAuroraData(), {
    headers: {
      // NOAA is cached by BAV for five minutes. A small partner cache avoids
      // unnecessary requests while ensuring a key is never stored by a shared
      // public cache.
      "Cache-Control": "private, max-age=60",
      Vary: "Authorization, X-BAV-Aurora-Key",
    },
  });
}
