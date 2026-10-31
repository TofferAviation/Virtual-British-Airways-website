import Link from "next/link";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getActiveFleetFlightAssignmentForPilot, getFleetAircraft } from "@/lib/fleet-service";
import { releaseStaleAircraft } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Release a stale aircraft assignment" };

export default async function AircraftReleasePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const pilot = await requirePilotSession();
  const query = await searchParams;
  const assignment = await getActiveFleetFlightAssignmentForPilot({ subject: `bav:${pilot.pilotId}`, displayName: pilot.name, fleetRole: "pilot" });
  const aircraft = assignment ? await getFleetAircraft(assignment.aircraftId) : null;
  return <main className="page-shell"><div className="page-container" style={{ maxWidth: 760, padding: "48px 24px" }}>
    <Link href="/account">← Pilot account</Link>
    <h1>Release a stale aircraft assignment</h1>
    {query.released === "1" ? <p role="status">Your stale aircraft lock was released. Refresh Fleet in Ember before selecting your next registration.</p> : null}
    {query.error ? <p role="alert">{query.error}</p> : null}
    {assignment && aircraft ? <>
      <h2>{aircraft.registration} · {assignment.flightReference}</h2>
      <p>{assignment.departureStation} → {assignment.arrivalStation} · {assignment.status}</p>
      <p>Use this only after the flight has ended and Ember has left the registration locked. Release preserves your flight reports and telemetry. It does not verify an arrival, move the aircraft or change its maintenance restrictions.</p>
      <form action={releaseStaleAircraft}>
        <input type="hidden" name="aircraftId" value={aircraft.id} /><input type="hidden" name="assignmentId" value={assignment.id} />
        <label>Reason for release<textarea name="reason" required minLength={10} maxLength={800} style={{ display: "block", width: "100%", minHeight: 100, margin: "12px 0" }} /></label>
        <label style={{ display: "block", margin: "16px 0" }}><input type="checkbox" name="confirmed" value="yes" required /> This flight has ended and this aircraft is no longer in use.</label>
        <button className="button button-primary" type="submit">Release {aircraft.registration}</button>
      </form>
    </> : <p>No active aircraft assignment is attached to your account.</p>}
    <p><Link href="/book">Choose your next flight →</Link></p>
  </div></main>;
}
