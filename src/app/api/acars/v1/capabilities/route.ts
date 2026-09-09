import { NextResponse } from "next/server";
import { ACARS_PROTOCOL_VERSION, supportedSimulatorLabels } from "@/lib/acars-contract";

export async function GET() {
  return NextResponse.json({
    service: "BAV FreeFlight ACARS",
    protocolVersion: ACARS_PROTOCOL_VERSION,
    supportedSimulators: Object.entries(supportedSimulatorLabels).map(([id, name]) => ({ id, name })),
    telemetryEndpointStatus: "planned",
    pirepPipeline: "shared",
  });
}
