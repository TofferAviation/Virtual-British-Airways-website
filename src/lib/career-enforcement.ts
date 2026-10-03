import type { CareerExperienceMode } from "@/lib/career-experience";

/**
 * Career access is deliberately a staged rollout. Until staff explicitly
 * enable it, established rank/type-rating checks remain exactly as they are.
 *
 * Once enabled, only pilots who opt into Realistic Operations receive the
 * operational qualification checks. Fly and Career remain choice-led modes;
 * neither is allowed to create, renew, or imply a qualification.
 */
export type CareerAircraftAccessPolicy = "legacy" | "optional" | "realistic_operations";

export function isCareerEnforcementEnabled(environment = process.env): boolean {
  const value = environment.BAV_CAREER_ENFORCEMENT?.trim().toLowerCase();
  // Keep the original true value compatible with any private test deployment.
  return value === "enabled" || value === "true";
}

export function getCareerAircraftAccessPolicy(
  mode: CareerExperienceMode,
  environment = process.env,
): CareerAircraftAccessPolicy {
  if (!isCareerEnforcementEnabled(environment)) return "legacy";
  return mode === "realistic_operations" ? "realistic_operations" : "optional";
}
