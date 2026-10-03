import { NextResponse } from "next/server";
import { ACARS_PROTOCOL_VERSION, supportedSimulatorLabels } from "@/lib/acars-contract";

export async function GET() {
  return NextResponse.json({
    service: "BAV Ember ACARS",
    protocolVersion: ACARS_PROTOCOL_VERSION,
    supportedSimulators: Object.entries(supportedSimulatorLabels).map(([id, name]) => ({ id, name })),
    // Ember v0.5.33+ sends real simulator samples to the session telemetry
    // endpoint. Keep this capability truthful so desktop clients and support
    // tools do not mistake the live integration for a future placeholder.
    telemetryEndpointStatus: "available",
    pirepPipeline: "shared",
  });
}
