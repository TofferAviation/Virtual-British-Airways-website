import { NextRequest } from "next/server";
import { clearPilotSession } from "@/lib/pilot-auth";
import { clearStaffSession } from "@/lib/staff-auth";
import { relativeRedirect } from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const response = relativeRedirect("/", 303);
  // See the pilot logout route: users can hold a pilot and Staff Centre
  // session at once, so an explicit logout must clear both.
  clearPilotSession(response, request);
  clearStaffSession(response, request);
  return response;
}
