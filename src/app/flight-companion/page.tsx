import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import type { VirtualEvent } from "@/data/events";
import { listCrewRoomIntents } from "@/lib/crew-room-store";
import { listPilotCrewRoomRequests } from "@/lib/crew-room-request-store";
import { getEvents } from "@/lib/event-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getActivePilotBooking, getPilotFlightPlan, listPilotPireps } from "@/lib/pilot-operations-store";
import { getPilotById } from "@/lib/pilot-store";
import { listVoiceRooms } from "@/lib/voice-room-store";
import { getActiveAcarsSessionForPilot } from "@/lib/acars-store";
import { getActiveFleetFlightAssignmentForPilot, getFleetAircraftRecord } from "@/lib/fleet-service";
import { FlightCompanionExperience } from "./FlightCompanionExperience";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Flight Companion", description: "Prepare your next British Airways Virtual flight and meet the crew flying with you." };

function upcomingEvents(events: VirtualEvent[]) {
  const today = new Date().toISOString().slice(0, 10);
  return events
    .filter((event) => event.published && event.date >= today)
    .sort((left, right) => `${left.date}T${left.startUtc}`.localeCompare(`${right.date}T${right.startUtc}`))
    .slice(0, 3);
}

async function safeIntentions(eventId: string) {
  try {
    return await listCrewRoomIntents(eventId);
  } catch {
    // The rest of a pilot's flight preparation must remain available while a
    // Crew Lounge migration or a temporary community-data outage is resolved.
    return [];
  }
}

export default async function FlightCompanionPage() {
  const pilotSession = await requirePilotSession();
  const [pilot, assignment, events, rooms] = await Promise.all([
    getPilotById(pilotSession.pilotId),
    getActivePilotBooking(pilotSession.pilotId),
    getEvents(),
    listVoiceRooms(),
  ]);
  if (!pilot) return null;
  const [flightPlan, crewBoards, roomRequests, activeAcarsSession, fleetAssignment, pireps] = await Promise.all([
    assignment ? getPilotFlightPlan(assignment.id, pilot.id) : Promise.resolve(null),
    Promise.all(upcomingEvents(events).map((event) => safeIntentions(event.id))),
    listPilotCrewRoomRequests(pilot.id),
    getActiveAcarsSessionForPilot(pilot.id).catch(() => null),
    getActiveFleetFlightAssignmentForPilot({ subject: `bav:${pilot.id}`, displayName: pilot.name, fleetRole: "pilot" }).catch(() => null),
    listPilotPireps(pilot.id).catch(() => []),
  ]);
  const fleetAircraft = fleetAssignment ? await getFleetAircraftRecord(fleetAssignment.aircraftId).catch(() => null) : null;
  const latestPirep = pireps[0] ?? null;
  const nextEvents = upcomingEvents(events);

  return <><SiteHeader /><FlightCompanionExperience
    pilot={{ id: pilot.id, name: pilot.name, pilotNumber: pilot.pilotNumber, rank: pilot.rank }}
    assignment={assignment ? { id: assignment.id, flightNumber: assignment.flightNumber, from: assignment.from, to: assignment.to, aircraft: assignment.aircraft, date: assignment.date, departure: assignment.departure, arrival: assignment.arrival, duration: assignment.duration } : null}
    flightPlan={flightPlan ? { status: flightPlan.status, simbriefOfpId: flightPlan.simbriefOfpId } : null}
    operations={{
      ember: activeAcarsSession ? {
        flightNumber: activeAcarsSession.flightNumber,
        from: activeAcarsSession.from,
        to: activeAcarsSession.to,
        aircraft: activeAcarsSession.aircraft,
        simulator: activeAcarsSession.simulator,
        startedAt: activeAcarsSession.startedAt,
        updatedAt: activeAcarsSession.updatedAt,
        distanceNm: activeAcarsSession.distanceNm,
        phase: activeAcarsSession.lastSnapshot?.cabin?.flightPhase ?? null,
        altitudeFt: activeAcarsSession.lastSnapshot?.altitudeFt ?? null,
        groundSpeedKt: activeAcarsSession.lastSnapshot?.groundSpeedKt ?? null,
        onGround: activeAcarsSession.lastSnapshot?.onGround ?? null,
      } : null,
      fleet: fleetAssignment ? {
        registration: fleetAircraft?.registration ?? null,
        station: fleetAircraft?.currentStation ?? fleetAssignment.departureStation,
        status: fleetAssignment.status,
        availability: fleetAircraft?.availability.dispatchStatus ?? null,
      } : null,
      latestDebrief: latestPirep ? {
        id: latestPirep.id,
        flightNumber: latestPirep.flightNumber,
        from: latestPirep.from,
        to: latestPirep.to,
        completedAt: latestPirep.completedAt,
        status: latestPirep.status,
        blockMinutes: latestPirep.blockMinutes,
        pointsAwarded: latestPirep.pointsAwarded,
      } : null,
    }}
    initialCrewRoomRequests={roomRequests}
    initialEvents={nextEvents.map((event, index) => {
      const room = rooms.find((candidate) => candidate.eventId === event.id) ?? null;
      return {
        id: event.id,
        title: event.title,
        typeLabel: event.typeLabel,
        date: event.date,
        startUtc: event.startUtc,
        endUtc: event.endUtc,
        route: event.route,
        aircraftNote: event.aircraftNote,
        registrationOpen: event.registrationOpen,
        rewards: event.rewards,
        crewRoom: room ? { id: room.id, name: room.name, status: room.status } : null,
        intentions: crewBoards[index] ?? [],
      };
    })}
  /><SiteFooter /></>;
}
