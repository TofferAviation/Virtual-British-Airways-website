import { NextRequest } from "next/server";
import { clearPilotSession } from "@/lib/pilot-auth";
import { clearStaffSession } from "@/lib/staff-auth";
import { relativeRedirect } from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const response = relativeRedirect("/", 303);
  // A staff member can also have a pilot session in the same browser. Ending
  // only one made the header immediately show the other as signed in, which
  // looked like logout had failed. A deliberate logout always ends both BAV
  // website sessions; ordinary navigation still keeps each session in place.
  clearPilotSession(response, request);
  clearStaffSession(response, request);
  return response;
}
