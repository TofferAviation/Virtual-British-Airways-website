import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { ensureFleetMembership, FleetServiceError, type FleetActor } from "@/lib/fleet-service";

const deviceActor: FleetActor = {
  subject: "freeflight-cabin-controls",
  displayName: "FreeFlight Cabin Controls",
  fleetRole: "operations_controller",
};

function suppliedKey(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization?.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-freeflight-fleet-key")?.trim() ?? "";
}

function matches(expected: string, supplied: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function requireFleetDevice(request: NextRequest) {
  const expected = process.env.FLEET_DESKTOP_API_KEY?.trim();
  if (!expected) throw new FleetServiceError("The Fleet desktop API is not configured on this server.", 503);
  if (!matches(expected, suppliedKey(request))) throw new FleetServiceError("Fleet device authentication required.", 401);
  await ensureFleetMembership({
    subject: deviceActor.subject,
    displayName: deviceActor.displayName,
    websiteRole: "operations",
  });
  return deviceActor;
}
