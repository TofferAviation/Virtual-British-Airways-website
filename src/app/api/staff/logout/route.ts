import { NextRequest } from "next/server";
import { clearClosedBetaAccess } from "@/lib/closed-beta";
import { clearStaffSession } from "@/lib/staff-auth";
import { relativeRedirect } from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const response = relativeRedirect("/staff-login", 303);
  clearStaffSession(response, request);
  clearClosedBetaAccess(response, request);
  return response;
}
