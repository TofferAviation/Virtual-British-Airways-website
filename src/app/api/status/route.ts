import { NextResponse } from "next/server";
import {
  effectiveComponentStatus,
  getServiceStatusState,
  overallServiceStatus,
  serviceStateLabel,
} from "@/lib/service-status-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getServiceStatusState();
  const now = new Date();
  const overall = overallServiceStatus(state, now);

  return NextResponse.json({
    overall,
    components: state.components.map((component) => {
      const effectiveStatus = effectiveComponentStatus(state, component, now);
      return {
        ...component,
        effectiveStatus,
        effectiveStatusLabel: serviceStateLabel(effectiveStatus),
      };
    }),
    incidents: state.incidents,
    maintenance: state.maintenance,
  });
}
