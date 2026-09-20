import { promises as fs } from "node:fs";
import path from "node:path";
import type { PilotBooking } from "@/lib/pilot-operations-store";
import { getSimbriefCodes } from "@/lib/simbrief";

type OperationsRosterState = { bookings?: PilotBooking[] };

export type OperationsRosterFlight = {
  id: string;
  flightNumber: string;
  originIcao: string | null;
  destinationIcao: string | null;
  aircraft: string;
  departure: string;
  arrival: string;
  date: string;
  status: PilotBooking["status"];
};

/**
 * A deliberately anonymous, read-only operational board for Ember iPort.
 * Pilot identities and booking controls remain private to the owning account.
 */
export async function listOperationsRosterFlights() {
  const file = path.join(process.cwd(), ".bav-data", "pilot-operations.json");
  try {
    const state = JSON.parse(await fs.readFile(file, "utf8")) as OperationsRosterState;
    return (state.bookings ?? [])
      .filter((booking) => booking.status === "booked" || booking.status === "in_progress")
      .sort((a, b) => `${a.date}T${a.departure}`.localeCompare(`${b.date}T${b.departure}`))
      .slice(0, 100)
      .map<OperationsRosterFlight>((booking) => {
        const codes = getSimbriefCodes(booking);
        return {
          id: booking.id,
          flightNumber: booking.flightNumber,
          originIcao: codes.origin ?? null,
          destinationIcao: codes.destination ?? null,
          aircraft: booking.aircraft,
          departure: booking.departure,
          arrival: booking.arrival,
          date: booking.date,
          status: booking.status,
        };
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
