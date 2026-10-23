import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const layers = {
  surface: "BlueMarble_NextGeneration",
  night: "VIIRS_CityLights_2012",
  detail: "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual",
} as const;

/** Fixed NASA allowlist: no client supplied host, URL, token or layer. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const kind = query.get("kind") === "night" ? "night" : "surface";
  const z = Number(query.get("z"));
  const x = Number(query.get("x"));
  const y = Number(query.get("y"));
  if (
    !["z", "x", "y"].every((key) => query.has(key)) ||
    ![z, x, y].every(Number.isInteger) ||
    z < 0 ||
    z > (kind === "night" ? 6 : 10) ||
    x < 0 ||
    x >= 2 ** (z + 1) ||
    y < 0 ||
    y >= 2 ** z
  ) {
    return new NextResponse("Invalid imagery tile", { status: 400 });
  }
  const span = 180 / 2 ** z;
  const west = -180 + x * span;
  const north = 90 - y * span;
  const url = new URL(
    "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi",
  );
  url.search = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    // The annual Landsat mosaic is historical, not a live satellite feed.
    // Blue Marble remains underneath its no-data/ocean/polar gaps. This date
    // is explicitly listed in GIBS GetCapabilities for the annual layer.
    LAYERS: kind === "surface" && z >= 7 ? `${layers.surface},${layers.detail}` : layers[kind],
    ...(kind === "surface" && z >= 7 ? { TIME: "2000-12-01" } : {}),
    STYLES: "",
    FORMAT: "image/jpeg",
    SRS: "EPSG:4326",
    BBOX: `${west},${north - span},${west + span},${north}`,
    WIDTH: "512",
    HEIGHT: "512",
  }).toString();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 86400 },
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("image/")
    )
      throw new Error("NASA tile unavailable");
    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
        "X-Imagery-Source": kind === "surface" && z >= 7 ? layers.detail : layers[kind],
        "X-Imagery-Epoch": kind === "surface" && z >= 7 ? "2000-12-01" : "static",
      },
    });
  } catch {
    // Root imagery is shipped with the application, so an upstream outage
    // never replaces the Earth with an untextured green sphere.
    if (z === 0 && kind === "surface")
      return NextResponse.redirect(
        new URL(
          `/textures/earth/blue-marble-${x === 0 ? "west" : "east"}.jpg`,
          request.url,
        ),
      );
    return new NextResponse("NASA imagery temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "public, max-age=30" },
    });
  }
}
