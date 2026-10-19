"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CrewRoomRequestComposer } from "./CrewRoomRequestComposer";

type CrewIntent = {
  id: string;
  pilotId: string;
  pilotNumber: string;
  pilotName: string;
  rank: string;
  flightNumber: string | null;
  route: string | null;
  aircraft: string | null;
  updatedAt: string;
};

type CompanionEvent = {
  id: string;
  title: string;
  typeLabel: string;
  date: string;
  startUtc: string;
  endUtc: string;
  route: { from: string; to: string; fromName: string; toName: string };
  aircraftNote: string;
  registrationOpen: boolean;
  rewards: { vaPoints: number; tierPoints: number; badge?: string };
  crewRoom: { id: string; name: string; status: "scheduled" | "open" | "closed" } | null;
  intentions: CrewIntent[];
};

type Props = {
  pilot: { id: string; name: string; pilotNumber: string; rank: string };
  assignment: { id: string; flightNumber: string; from: string; to: string; aircraft: string; date: string; departure: string; arrival: string; duration: string } | null;
  flightPlan: { status: "draft" | "dispatch_opened" | "synced" | "sync_failed"; simbriefOfpId: string | null } | null;
  operations: {
    ember: {
      flightNumber: string;
      from: string;
      to: string;
      aircraft: string;
      simulator: "xplane12" | "msfs2020" | "msfs2024";
      startedAt: string;
      updatedAt: string;
      distanceNm: number;
      phase: string | null;
      altitudeFt: number | null;
      groundSpeedKt: number | null;
      onGround: boolean | null;
    } | null;
    fleet: { registration: string | null; station: string | null; status: "reserved" | "operating" | "completed" | "cancelled"; availability: string | null } | null;
    latestDebrief: { id: string; flightNumber: string; from: string; to: string; completedAt: string; status: "pending" | "changes_requested" | "accepted" | "rejected"; blockMinutes: number; pointsAwarded: number } | null;
  };
  initialEvents: CompanionEvent[];
  initialCrewRoomRequests: {
    id: string;
    roomName: string;
    flightNumber: string;
    routeFrom: string;
    routeTo: string;
    requestedCapacity: number;
    mediaPreferences: ("voice" | "camera" | "screen")[];
    bannerId: string;
    hasCustomBanner: boolean;
    status: "pending" | "approved" | "declined" | "cancelled";
    staffNote: string | null;
    voiceRoomId: string | null;
    createdAt: string;
  }[];
};

function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(date);
}

function initials(name: string) {
  const letters = name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2);
  return letters || "BA";
}

function checklistState(complete: boolean, action: boolean) {
  return complete ? "complete" : action ? "action" : "waiting";
}

function utcClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update pending";
  return `${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(date)} UTC`;
}

function duration(minutes: number) {
  const hours = Math.floor(Math.max(0, minutes) / 60);
  const remainder = Math.max(0, minutes) % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function friendlyStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function simulatorLabel(value: "xplane12" | "msfs2020" | "msfs2024") {
  return value === "xplane12" ? "X-Plane 12" : value === "msfs2024" ? "MSFS 2024" : "MSFS 2020";
}

export function FlightCompanionExperience({ pilot, assignment, flightPlan, operations, initialEvents, initialCrewRoomRequests }: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const joinedEventIds = useMemo(() => new Set(events.filter((event) => event.intentions.some((intention) => intention.pilotId === pilot.id)).map((event) => event.id)), [events, pilot.id]);
  const briefingReady = flightPlan?.status === "synced";
  const activeRoomRequest = initialCrewRoomRequests.find((request) => request.status === "approved" || request.status === "pending") ?? null;
  const ember = operations.ember;
  const fleet = operations.fleet;
  const debrief = operations.latestDebrief;
  const currentFlightLabel = ember ? `${ember.flightNumber} · ${ember.from} → ${ember.to}` : assignment ? `${assignment.flightNumber} · ${assignment.from} → ${assignment.to}` : "Choose a BAV flight to begin";

  async function updateCrewBoard(event: CompanionEvent) {
    const joining = !joinedEventIds.has(event.id);
    setBusyEventId(event.id);
    setNotice("");
    try {
      const response = await fetch(`/api/flight-companion/events/${encodeURIComponent(event.id)}/participation`, { method: joining ? "POST" : "DELETE" });
      const body = await response.json().catch(() => null) as { error?: string; intentions?: CrewIntent[] } | null;
      if (!response.ok || !body?.intentions) throw new Error(body?.error || "The crew board could not be updated.");
      setEvents((current) => current.map((item) => item.id === event.id ? { ...item, intentions: body.intentions ?? item.intentions } : item));
      setNotice(joining ? `You are now on the crew board for ${event.title}.` : `You have left the crew board for ${event.title}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The crew board could not be updated.");
    } finally {
      setBusyEventId(null);
    }
  }

  return <main className="flight-companion-page">
    <section className="flight-companion-hero">
      <div className="flight-companion-shell">
        <div className="flight-companion-hero-accessible-copy">
          <span className="flight-companion-kicker">BAV Flight Companion</span>
          <h1>{assignment ? "Your next flight, together." : "Make your next flight feel shared."}</h1>
          <p>{assignment ? `Your ${assignment.flightNumber} briefing, crew board and Lounge are all in one place.` : "Choose a BAV flight, find a community event, and meet the people flying alongside you."}</p>
        </div>
        <div className="flight-companion-hero-actions">
          <Link className="flight-companion-primary" href={assignment ? `/flight-plans/${encodeURIComponent(assignment.id)}` : "/book"}>{assignment ? "Open flight briefing" : "Find a BAV flight"}</Link>
          <Link className="flight-companion-secondary" href="/crew-lounge">Open Crew Lounge</Link>
        </div>
      </div>
    </section>

    <div className="flight-companion-shell flight-companion-content">
      <header className="flight-companion-heading">
        <div><span className="flight-companion-kicker">YOUR FLIGHT DAY</span><h2>Welcome back, {pilot.name}</h2><p>Everything here comes from your BAV assignment, briefing and voluntary community crew boards.</p></div>
        <span className="flight-companion-pilot">{pilot.pilotNumber} · {pilot.rank}</span>
      </header>

      <section className="flight-companion-board" aria-labelledby="flight-companion-board-title">
        <header className="flight-companion-board-heading">
          <div><span className="flight-companion-kicker">TODAY&apos;S OPERATIONS</span><h2 id="flight-companion-board-title">Your shared flight board</h2><p>One clear place for the flight you chose, the people around it and what Ember sees when you begin.</p></div>
          <span className={ember ? "flight-companion-live-pill active" : "flight-companion-live-pill"}><i aria-hidden="true" />{ember ? "Ember connected" : assignment ? "Ready on the ground" : "Awaiting a flight"}</span>
        </header>
        <div className="flight-companion-board-grid">
          <article className="flight-companion-operation-card flight-companion-operation-primary">
            <span className="flight-companion-kicker">CURRENT SECTOR</span>
            <h3>{currentFlightLabel}</h3>
            <p>{ember ? `${ember.aircraft} is currently connected through ${simulatorLabel(ember.simulator)}.` : assignment ? `${assignment.aircraft} · ${assignment.date} · scheduled departure ${assignment.departure}.` : "Browse the verified BAV schedule, then return here for a focused pre-flight board."}</p>
            <div className="flight-companion-operation-steps">
              <span className={assignment ? "ready" : ""}><i />Flight</span>
              <span className={briefingReady ? "ready" : ""}><i />Briefing</span>
              <span className={activeRoomRequest?.status === "approved" || joinedEventIds.size ? "ready" : ""}><i />Crew</span>
              <span className={ember ? "ready" : ""}><i />Ember</span>
            </div>
            <div className="flight-companion-operation-actions">
              <Link className="flight-companion-primary" href={ember ? "/ba-radar" : assignment ? `/flight-plans/${encodeURIComponent(assignment.id)}` : "/book"}>{ember ? "View live operations" : assignment ? briefingReady ? "Open briefing" : "Prepare briefing" : "Find a BAV flight"}</Link>
              <Link className="flight-companion-board-text-link" href="/crew-lounge">Open Crew Lounge →</Link>
            </div>
          </article>

          <article className="flight-companion-operation-card">
            <header><span className="flight-companion-kicker">EMBER STATUS</span><b className={ember ? "status-good" : ""}>{ember ? "LIVE" : "STANDBY"}</b></header>
            {ember ? <><h3>{ember.phase ? friendlyStatus(ember.phase) : ember.onGround ? "On the ground" : "Flight telemetry active"}</h3><dl className="flight-companion-operation-metrics"><div><dt>Altitude</dt><dd>{ember.altitudeFt == null ? "—" : `${Math.round(ember.altitudeFt).toLocaleString()} ft`}</dd></div><div><dt>Ground speed</dt><dd>{ember.groundSpeedKt == null ? "—" : `${Math.round(ember.groundSpeedKt)} kt`}</dd></div><div><dt>Distance recorded</dt><dd>{Math.round(ember.distanceNm).toLocaleString()} NM</dd></div><div><dt>Last update</dt><dd>{utcClock(ember.updatedAt)}</dd></div></dl><Link className="flight-companion-board-text-link" href="/ba-radar">Open BA-Radar →</Link></> : <><h3>Waiting for Ember</h3><p>When you start your BAV assignment in Ember, its operational state appears here without exposing your private route history.</p><span className="flight-companion-operation-note">Connect after your simulator is ready.</span></>}
          </article>

          <article className="flight-companion-operation-card">
            <header><span className="flight-companion-kicker">AIRCRAFT &amp; TURNAROUND</span><b className={fleet?.status === "operating" ? "status-good" : ""}>{fleet ? friendlyStatus(fleet.status) : "OPTIONAL"}</b></header>
            {fleet ? <><h3>{fleet.registration ?? "Assigned BAV aircraft"}</h3><dl className="flight-companion-operation-metrics"><div><dt>Current station</dt><dd>{fleet.station ?? "Station pending"}</dd></div><div><dt>Dispatch state</dt><dd>{fleet.availability ? friendlyStatus(fleet.availability) : "Assignment active"}</dd></div></dl><p>Fleet keeps the authoritative airframe location while your pilot credit remains attached to your own completed PIREP.</p></> : <><h3>No managed tail selected</h3><p>You can still fly normally. Select a Fleet registration while booking when you want its live station and turnaround to follow this board.</p><Link className="flight-companion-board-text-link" href={assignment ? `/flight-plans/${encodeURIComponent(assignment.id)}` : "/book"}>Manage aircraft →</Link></>}
          </article>

          <article className="flight-companion-operation-card">
            <header><span className="flight-companion-kicker">CREW &amp; AFTER FLIGHT</span><b className={activeRoomRequest?.status === "approved" ? "status-good" : ""}>{activeRoomRequest?.status === "approved" ? "ROOM OPEN" : activeRoomRequest ? "REQUESTED" : "PERSONAL"}</b></header>
            <h3>{activeRoomRequest?.status === "approved" ? `${activeRoomRequest.roomName} is ready` : joinedEventIds.size ? "You are on a crew board" : "Your crew space is optional"}</h3>
            <p>{activeRoomRequest?.status === "approved" ? "Your staff-approved room is available in the Lounge when you want to coordinate." : joinedEventIds.size ? "Your event-board signal is visible to pilots who are planning the same community flight." : "Use the Lounge for voice, a quick chat or a crew-room request—never required to fly."}</p>
            {debrief ? <Link className="flight-companion-debrief-link" href={`/account/flights/${encodeURIComponent(debrief.id)}`}>Latest debrief · {debrief.flightNumber} {debrief.from} → {debrief.to}<small>{duration(debrief.blockMinutes)} · {friendlyStatus(debrief.status)} · {debrief.pointsAwarded} VA points</small></Link> : <span className="flight-companion-operation-note">Your completed Ember flights will return here as debriefs.</span>}
          </article>
        </div>
        <p className="flight-companion-board-privacy">The board only combines records already connected to your BAV account. It does not alter your booking, activate Ember, or reveal private telemetry to other pilots.</p>
      </section>

      <section className="flight-companion-flight-card" aria-label="Your next BAV flight">
        <div className="flight-companion-flight-title"><span className="flight-companion-kicker">YOUR NEXT BAV FLIGHT</span><h2>{assignment ? `${assignment.flightNumber} · ${assignment.from} → ${assignment.to}` : "Ready when you are"}</h2><p>{assignment ? `${assignment.aircraft} · ${assignment.date} · departs ${assignment.departure}` : "Pick a verified BAV service first, then return here to prepare it with the community."}</p></div>
        {assignment ? <div className="flight-companion-flight-facts"><span><b>Aircraft</b>{assignment.aircraft}</span><span><b>Arrival</b>{assignment.arrival}</span><span><b>Duration</b>{assignment.duration}</span><Link href={`/flight-plans/${encodeURIComponent(assignment.id)}`}>{briefingReady ? `OFP ${flightPlan?.simbriefOfpId ? `#${flightPlan.simbriefOfpId}` : "ready"} →` : "Prepare briefing →"}</Link></div> : <Link className="flight-companion-primary compact" href="/book">Browse the BAV schedule</Link>}
      </section>

      <section className="flight-companion-checklist" aria-label="Flight day checklist">
        <article className={checklistState(Boolean(assignment), true)}><i>1</i><div><span>BAV SERVICE</span><strong>{assignment ? "Flight selected" : "Choose a BAV flight"}</strong><small>{assignment ? "Your assignment is protected in BAV." : "Start with the current BAV schedule."}</small></div></article>
        <article className={checklistState(Boolean(briefingReady), Boolean(assignment))}><i>2</i><div><span>BRIEFING</span><strong>{briefingReady ? "SimBrief plan ready" : assignment ? "Prepare your briefing" : "Waiting for a flight"}</strong><small>{briefingReady ? "Your latest OFP is linked to this assignment." : "The flight desk handles your SimBrief workflow."}</small></div></article>
        <article className={checklistState(joinedEventIds.size > 0, initialEvents.length > 0)}><i>3</i><div><span>CREW BOARD</span><strong>{joinedEventIds.size ? "Flying with the community" : "Find your crew"}</strong><small>{joinedEventIds.size ? "You are visible to other pilots on your selected crew board." : "Join a voluntary board below to plan together."}</small></div></article>
        <article className={checklistState(false, Boolean(assignment))}><i>4</i><div><span>EMBER</span><strong>{assignment ? "Ready to connect" : "Waiting for a flight"}</strong><small>{assignment ? "Open Ember when your simulator is ready." : "Ember connects to an active BAV assignment."}</small></div></article>
      </section>

      <CrewRoomRequestComposer assignment={assignment} initialRequests={initialCrewRoomRequests} />

      <section className="flight-companion-community" aria-labelledby="flight-companion-community-title">
        <header><div><span className="flight-companion-kicker">GROUP FLIGHTS</span><h2 id="flight-companion-community-title">Find your crew</h2><p>Join a board to say you are interested in flying together. It does not register you for an event or book a BAV flight.</p></div><Link href="/events">View BAV events →</Link></header>
        {notice ? <p className="flight-companion-notice" role="status">{notice}</p> : null}
        <div className="flight-companion-event-grid">
          {events.length ? events.map((event) => {
            const joined = joinedEventIds.has(event.id);
            const crew = event.intentions.slice(0, 5);
            const morePilots = Math.max(0, event.intentions.length - crew.length);
            return <article className="flight-companion-event" key={event.id}>
              <header><span>{dateLabel(event.date)} · {event.startUtc} UTC</span><b>{event.typeLabel}</b></header>
              <h3>{event.title}</h3>
              <p className="flight-companion-route">{event.route.from} <span>→</span> {event.route.to}</p>
              <p className="flight-companion-event-note">{event.aircraftNote}</p>
              <div className="flight-companion-crew-list" aria-label={`${event.intentions.length} pilots on this crew board`}>
                {crew.length ? <>{crew.map((intention) => <span className="flight-companion-crew-member" title={`${intention.pilotName} · ${intention.rank}`} key={intention.id}>{initials(intention.pilotName)}</span>)}<strong>{event.intentions.length} {event.intentions.length === 1 ? "pilot" : "pilots"} on the board{morePilots ? ` +${morePilots}` : ""}</strong></> : <strong>No one has joined this crew board yet.</strong>}
              </div>
              <footer><button type="button" className={joined ? "flight-companion-secondary joined" : "flight-companion-primary"} disabled={busyEventId === event.id} onClick={() => void updateCrewBoard(event)}>{busyEventId === event.id ? "Updating…" : joined ? "Leave crew board" : "I’m planning to fly"}</button><Link href="/book">Open BAV schedule</Link>{event.crewRoom ? <Link href="/crew-lounge">{event.crewRoom.status === "open" ? "Open crew room" : `${event.crewRoom.name} room`}</Link> : null}</footer>
            </article>;
          }) : <div className="flight-companion-empty"><strong>No upcoming BAV events yet</strong><span>When BAV publishes the next community event, its crew board will appear here.</span><Link href="/crew-lounge">Visit the Crew Lounge</Link></div>}
        </div>
      </section>

      <aside className="flight-companion-honesty"><strong>Plan socially, fly your way</strong><span>Crew-board participation is only a community signal. Your booking, aircraft selection, event registration and voice settings remain separate and always under your control.</span></aside>
    </div>
  </main>;
}
