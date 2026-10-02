import { NextRequest } from "next/server";
import { clearPilotSession } from "@/lib/pilot-auth";
import { clearClosedBetaAccess } from "@/lib/closed-beta";
import { relativeRedirect } from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const response = relativeRedirect("/", 303);
  clearPilotSession(response, request);
  clearClosedBetaAccess(response, request);
  return response;
}
