import { NextRequest } from "next/server";
import { clearPilotSession } from "@/lib/pilot-auth";
import { relativeRedirect } from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const response = relativeRedirect("/", 303);
  clearPilotSession(response, request);
  return response;
}
