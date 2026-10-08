import { NextResponse } from "next/server";
import { getAcarsSession, listAcarsSessionSnapshots } from "@/lib/acars-store";
import { requirePilotSession } from "@/lib/pilot-auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePilotSession();
    const { id } = await params;
    if (!/^[0-9a-f-]{20,80}$/i.test(id)) return NextResponse.json({ error: "Flight replay not found." }, { status: 404 });

    const flight = await getAcarsSession(id);
    if (!flight || flight.pilotId !== session.pilotId || flight.status !== "completed") return NextResponse.json({ error: "Flight replay not found." }, { status: 404 });

    const snapshots = await listAcarsSessionSnapshots(flight.id, session.pilotId);
    return NextResponse.json({
      replay: {
        id: flight.id,
        flightNumber: flight.flightNumber,
        from: flight.from,
        to: flight.to,
        aircraft: flight.aircraft,
        completedAt: flight.completedAt,
        distanceNm: Math.round(flight.distanceNm),
        landingFpm: flight.landingFpm,
        snapshots: snapshots.map((snapshot) => ({
          timestamp: snapshot.timestamp,
          latitude: snapshot.latitude,
          longitude: snapshot.longitude,
          altitudeFt: snapshot.altitudeFt,
          groundSpeedKt: snapshot.groundSpeedKt,
          headingDeg: snapshot.headingDeg,
          onGround: snapshot.onGround,
        })),
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Flight replay is temporarily unavailable." }, { status: 401 });
  }
}
