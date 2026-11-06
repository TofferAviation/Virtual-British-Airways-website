export const registrationErrors = {
  "registration-unavailable": "Fleet could not reserve this registration. It may be reserved, operating, or restricted. Refresh the available registrations and try again.",
  "registration-active-flight": "Your account already has an aircraft marked as operating. End that flight in Ember, or release its stale assignment if the flight has finished.",
  "registration-access": "Fleet could not verify your reservation access. Refresh your account connection and try again.",
  "registration-service": "Fleet is temporarily unavailable. Your flight and briefing are saved; try the reservation again shortly.",
  "registration-failed": "Fleet could not confirm this reservation. Your flight and briefing are saved. Please retry, or contact Operations if it continues.",
} as const;

export function registrationFailureCode(error: { message: string; status: number }): keyof typeof registrationErrors {
  if (error.message.includes("already have an aircraft operating")) return "registration-active-flight";
  if (error.status === 401 || error.status === 403) return "registration-access";
  if (error.status >= 500) return "registration-service";
  if (error.message.includes("unavailable for selection") || error.status === 409) return "registration-unavailable";
  return "registration-failed";
}

export function registrationErrorMessage(code: string): string | null {
  return Object.hasOwn(registrationErrors, code) ? registrationErrors[code as keyof typeof registrationErrors] : null;
}
