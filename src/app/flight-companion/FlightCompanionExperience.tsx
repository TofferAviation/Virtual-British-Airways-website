"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
  initialEvents: CompanionEvent[];
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

export function FlightCompanionExperience({ pilot, assignment, flightPlan, initialEvents }: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const joinedEventIds = useMemo(() => new Set(events.filter((event) => event.intentions.some((intention) => intention.pilotId === pilot.id)).map((event) => event.id)), [events, pilot.id]);
  const briefingReady = flightPlan?.status === "synced";

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
