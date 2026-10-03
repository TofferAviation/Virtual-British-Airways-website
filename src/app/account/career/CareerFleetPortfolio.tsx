import Link from "next/link";
import { fleetAircraftMatchesVirtualType, type FleetAircraftSummary } from "@/lib/fleet-service";
import { ratingForAircraft } from "@/lib/career-defaults";
import type { PilotQualification } from "@/lib/pilot-career";
import type { PilotPirep } from "@/lib/pilot-operations-store";
import styles from "./CareerFleetPortfolio.module.css";

const FAMILY_LABELS: Record<string, string> = {
  E190: "Embraer E190",
  A320_FAMILY: "Airbus A320 family",
  A320_NEO: "Airbus A320neo family",
  B777: "Boeing 777",
  B787: "Boeing 787",
  A350: "Airbus A350",
  A380: "Airbus A380",
};

function blockTime(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type Props = {
  fleetAircraft: FleetAircraftSummary[];
  pireps: PilotPirep[];
  qualifications: PilotQualification[];
  activeAssignment: string | null;
};

export function CareerFleetPortfolio({ fleetAircraft, pireps, qualifications, activeAssignment }: Props) {
  const accepted = pireps.filter((pirep) => pirep.status === "accepted");
  const byAircraft = new Map<string, PilotPirep[]>();
  for (const pirep of accepted) byAircraft.set(pirep.aircraft, [...(byAircraft.get(pirep.aircraft) ?? []), pirep]);
  const entries = [...byAircraft.entries()].map(([aircraft, flights]) => {
    const family = ratingForAircraft(aircraft);
    const qualification = qualifications.find((item) => item.qualificationDefinitionId === family);
    const matchingFleetAircraft = fleetAircraft.filter((item) => fleetAircraftMatchesVirtualType(item, aircraft));
    return {
      aircraft,
      family: FAMILY_LABELS[family] ?? family,
      flights: flights.length,
      blockMinutes: flights.reduce((total, flight) => total + Math.max(0, flight.blockMinutes), 0),
      distanceNm: flights.reduce((total, flight) => total + Math.max(0, flight.distanceNm), 0),
      fleetMatches: matchingFleetAircraft.length,
      fleetHoursMinutes: matchingFleetAircraft.reduce((total, item) => total + Math.max(0, item.airframeHoursMinutes), 0),
      fleetCycles: matchingFleetAircraft.reduce((total, item) => total + Math.max(0, item.airframeCycles), 0),
      fleetContext: matchingFleetAircraft.filter((item) => item.currentStation || item.lastFlightAt || item.nextAssignedFlightReference).sort((left, right) => (right.lastFlightAt ?? "").localeCompare(left.lastFlightAt ?? "")).slice(0, 2),
      qualification: qualification?.status ?? null,
    };
  }).sort((left, right) => right.blockMinutes - left.blockMinutes || left.aircraft.localeCompare(right.aircraft));
  const totalMinutes = entries.reduce((total, entry) => total + entry.blockMinutes, 0);
  const totalDistanceNm = entries.reduce((total, entry) => total + entry.distanceNm, 0);

  return <article className="career-card career-card-wide career-module career-module-fleet">
    <div className="career-card-head"><div><span>FLEET CAREER · PILOT PORTFOLIO</span><h2>Your virtual fleet story</h2></div><Link href="/fleet">View Fleet →</Link></div>
    <p>Accepted BAV PIREPs build this personal aircraft portfolio. It is a record of your flying, not a registration assignment, operational restriction or real-world logbook.</p>
    <div className={styles.summary} aria-label="Fleet career summary"><div><span>Types operated</span><strong>{entries.length}</strong><small>Across accepted BAV PIREPs</small></div><div><span>Accepted sectors</span><strong>{accepted.length}</strong><small>Your completed pilot cycles</small></div><div><span>Fleet block time</span><strong>{blockTime(totalMinutes)}</strong><small>Accepted BAV PIREPs only</small></div><div><span>Nautical miles</span><strong>{totalDistanceNm.toLocaleString("en-GB")}</strong><small>Accepted BAV PIREPs only</small></div></div>
    {entries.length ? <div className={styles.entries}>{entries.map((entry) => <section key={entry.aircraft}><div><span>{entry.family}</span><strong>{entry.aircraft}</strong></div><dl><div><dt>Your sectors / cycles</dt><dd>{entry.flights}</dd></div><div><dt>Your block time</dt><dd>{blockTime(entry.blockMinutes)}</dd></div><div><dt>Your nautical miles</dt><dd>{entry.distanceNm.toLocaleString("en-GB")} NM</dd></div><div><dt>Fleet registrations</dt><dd>{entry.fleetMatches || "No matching record"}</dd></div>{entry.fleetMatches ? <><div><dt>Fleet airframe time</dt><dd>{blockTime(entry.fleetHoursMinutes)}</dd></div><div><dt>Fleet cycles</dt><dd>{entry.fleetCycles.toLocaleString("en-GB")}</dd></div></> : null}<div><dt>Qualification</dt><dd>{entry.qualification?.replaceAll("_", " ") ?? "Not yet held"}</dd></div></dl>{entry.fleetContext.length ? <div className={styles.context}><span>Fleet lifecycle now</span>{entry.fleetContext.map((aircraft) => <p key={aircraft.id}><strong>{aircraft.registration}</strong> · {aircraft.currentStation ?? "station pending"} · {label(aircraft.technicalStatus)} / {label(aircraft.dispatchStatus)}{aircraft.nextAssignedFlightReference ? ` · assigned ${aircraft.nextAssignedFlightReference}` : ""}</p>)}</div> : null}<Link href={`/book?aircraft=${encodeURIComponent(entry.aircraft)}`}>View scheduled flights →</Link></section>)}</div> : <p className={styles.empty}>Your first accepted BAV PIREP will create an aircraft entry here.</p>}
    <p className={styles.note}>{activeAssignment ? `${activeAssignment} is currently linked to a Fleet registration. ` : "No active Fleet registration is currently linked to your account. "}Your personal hours, sectors and miles come only from accepted BAV PIREPs; the lifecycle context is a read-only view of the live Fleet service.</p>
  </article>;
}
