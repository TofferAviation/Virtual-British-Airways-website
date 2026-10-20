"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type VoicePilot, type VoiceRoom, useCrewVoice } from "@/components/CrewVoiceProvider";
import { PeerVoiceCall } from "./PeerVoiceCall";

type BriefingEvent = {
  id: string;
  title: string;
  typeLabel: string;
  date: string;
  startUtc: string;
  route: { from: string; to: string; fromName: string; toName: string };
  aircraftNote: string;
  participantCount: number;
};

type BriefingRoomProps = {
  room: VoiceRoom & { description?: string; eventId?: string | null };
  pilot: VoicePilot;
  events: BriefingEvent[];
};

type WallView = "flight-plan" | "route" | "weather" | "notes";

type SharedBriefing = {
  picPilotId: string;
  bookingId: string | null;
  plan: null | {
    flightNumber: string; from: string; to: string; aircraft: string; date: string; departure: string; arrival: string; duration: string; registration: string | null;
    route: string | null; cruiseAltitude: string | null; alternate: string | null;
    simbrief: null | { originMetar: string | null; destinationMetar: string | null; originRunway: string | null; destinationRunway: string | null; distanceNm: string | null; passengerCount: string | null; blockFuel: string | null; tripFuel: string | null; scheduledOut: string | null; scheduledIn: string | null; blockTime: string | null; aircraftIcao: string | null };
  };
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BA";
}

function seatPosition(index: number) {
  const positions = ["port-1", "port-2", "port-3", "port-4", "starboard-1", "starboard-2", "starboard-3", "starboard-4"];
  return positions[index - 1] ?? "";
}

function formattedDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function PresentationVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} className="briefing-presentation-video" autoPlay muted playsInline />;
}

function PilotPortrait({ image, name }: { image: string | null; name: string }) {
  const [failed, setFailed] = useState(!image);
  if (failed || !image) return <i>{initials(name)}</i>;
  return <img src={image} alt="" onError={() => setFailed(true)} />;
}

export function BriefingRoom({ room, pilot, events }: BriefingRoomProps) {
  const voice = useCrewVoice();
  const [selectedSeat, setSelectedSeat] = useState(1);
  const [wallView, setWallView] = useState<WallView>("flight-plan");
  const [sharedBriefing, setSharedBriefing] = useState<SharedBriefing | null>(null);
  const [briefingNotice, setBriefingNotice] = useState("");
  const [publishingBriefing, setPublishingBriefing] = useState(false);
  const isThisRoom = voice.activeRoom?.id === room.id;
  const briefing = useMemo(() => events.find((event) => event.id === room.eventId) ?? null, [events, room.eventId]);
  const participants = isThisRoom ? voice.participants : [];
  const remotePresentation = Object.entries(voice.remoteStreams).find(([, stream]) => stream.getVideoTracks().some((track) => track.readyState === "live" && !track.muted));
  const presentationStream = voice.screenOn ? voice.previewStream : remotePresentation?.[1] ?? null;
  const presentationPilot = voice.screenOn ? "Your screen" : participants.find((participant) => participant.sessionId === remotePresentation?.[0])?.name ?? "Live presentation";
  const localSeat = participants.find((participant) => participant.pilotId === pilot.id)?.seatIndex;
  const seats = Array.from({ length: room.maxParticipants }, (_, index) => {
    const seatIndex = index + 1;
    return { seatIndex, pilot: participants.find((participant) => participant.seatIndex === seatIndex) ?? null };
  });
  const activeSeats = participants.filter((participant) => participant.seatIndex === null).length;
  const plan = sharedBriefing?.plan ?? null;
  const isPic = sharedBriefing?.picPilotId === pilot.id;

  useEffect(() => {
    let current = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/crew-lounge/rooms/${room.id}/briefing`, { cache: "no-store" });
        const data = await response.json().catch(() => null) as { briefing?: SharedBriefing | null; error?: string } | null;
        if (!response.ok) throw new Error(data?.error || "The shared flight plan is unavailable.");
        if (current) { setSharedBriefing(data?.briefing ?? null); setBriefingNotice(""); }
      } catch (error) { if (current) setBriefingNotice(error instanceof Error ? error.message : "The shared flight plan is unavailable."); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => { current = false; window.clearInterval(timer); };
  }, [room.id]);

  async function publishBriefing() {
    setPublishingBriefing(true); setBriefingNotice("");
    try {
      const response = await fetch(`/api/crew-lounge/rooms/${room.id}/briefing`, { method: "POST" });
      const data = await response.json().catch(() => null) as { briefing?: SharedBriefing; error?: string } | null;
      if (!response.ok || !data?.briefing) throw new Error(data?.error || "The flight could not be published.");
      setSharedBriefing(data.briefing); setBriefingNotice("Your current flight is now the room’s shared briefing plan.");
    } catch (error) { setBriefingNotice(error instanceof Error ? error.message : "The flight could not be published."); }
    finally { setPublishingBriefing(false); }
  }

  const seatLabel = (seatIndex: number, occupant: typeof participants[number] | null) => {
    if (occupant?.pilotId === pilot.id) return `Your selected chair, seat ${seatIndex}`;
    if (occupant) return `${occupant.name} is in seat ${seatIndex}`;
    return `Choose briefing chair ${seatIndex}`;
  };

  return <section className="briefing-room" aria-label="Interactive flight briefing room">
    <header className="briefing-room-heading">
      <div>
        <span className="crew-voice-eyebrow">BAV flight briefing centre</span>
        <h3>{room.name}</h3>
        <p>{briefing ? `${briefing.typeLabel} · ${briefing.title}` : "A private eight-pilot briefing room. Choose a chair, join muted, and prepare together."}</p>
      </div>
      <div className="briefing-room-capacity"><span className={isThisRoom ? "live" : ""} aria-hidden="true" />{participants.length}/{room.maxParticipants} in room</div>
      <div className="briefing-room-actions">
        {!sharedBriefing ? <span>Awaiting staff PIC assignment</span> : null}
        {isPic ? <button type="button" onClick={() => void publishBriefing()} disabled={publishingBriefing}>{publishingBriefing ? "Publishing…" : plan ? "Update shared booking" : "Publish my booking"}</button> : null}
        {sharedBriefing && !plan && !isPic ? <span>Waiting for the PIC to publish a flight</span> : null}
        {plan ? <a href={`/book?from=${encodeURIComponent(plan.from)}&to=${encodeURIComponent(plan.to)}&date=${encodeURIComponent(plan.date)}&flight=${encodeURIComponent(plan.flightNumber)}`}>Book {plan.flightNumber}</a> : null}
      </div>
    </header>

    <section className="briefing-room-scene" aria-label="Briefing room seat plan and shared presentation wall">
      <div className="briefing-wall" aria-live="polite">
        <div className={`briefing-wall-content${presentationStream ? " is-presenting" : ""}`}>
          {presentationStream ? <><PresentationVideo stream={presentationStream} /><span className="briefing-presentation-label">Live presentation · {presentationPilot}</span></> : <>
          {wallView === "flight-plan" ? <>
            <span>British Airways Virtual · flight plan</span>
            <strong>{plan ? plan.flightNumber : briefing ? briefing.title : "Flight plan awaiting selection"}</strong>
            <b>{plan ? `${plan.from}  →  ${plan.to}` : briefing ? `${briefing.route.from}  →  ${briefing.route.to}` : "Choose a linked event to populate the route"}</b>
            <small>{plan ? `${plan.aircraft}${plan.registration ? ` · ${plan.registration}` : ""} · STD ${plan.departure} · STA ${plan.arrival} · ${plan.duration}${plan.simbrief?.distanceNm ? ` · ${plan.simbrief.distanceNm} NM` : ""}` : briefing ? `${briefing.route.fromName} to ${briefing.route.toName} · ${formattedDate(briefing.date)} · ${briefing.startUtc}Z` : "The PIC can publish their own booking for the crew to follow."}</small>
          </> : null}
          {wallView === "route" ? <>
            <span>Route overview</span><strong>{plan ? `${plan.from} — ${plan.to}` : briefing ? `${briefing.route.from} — ${briefing.route.to}` : "Route awaiting briefing selection"}</strong><div className="briefing-route-line"><i /> <em>✈</em> <i /></div><small>{plan?.route ? `${plan.route}${plan.cruiseAltitude ? ` · planned ${plan.cruiseAltitude}` : ""}${plan.alternate ? ` · alternate ${plan.alternate}` : ""}` : briefing ? briefing.aircraftNote : "A host can use screen share for a live SimBrief, chart, or route review."}</small>
          </> : null}
          {wallView === "weather" ? <>
            <span>Weather desk</span><strong>{plan?.simbrief?.originMetar || plan?.simbrief?.destinationMetar ? "Flight-plan weather" : "Live weather is not invented"}</strong><b>{plan ? `${plan.from} & ${plan.to}` : briefing ? `${briefing.route.from} & ${briefing.route.to}` : "Departure & destination"}</b><small>{plan?.simbrief?.originMetar || plan?.simbrief?.destinationMetar ? `${plan.from}: ${plan.simbrief?.originMetar ?? "not supplied"} · ${plan.to}: ${plan.simbrief?.destinationMetar ?? "not supplied"}` : "Use the shared-screen control for a live METAR, TAF, or weather source during this free pilot-room release."}</small>
          </> : null}
          {wallView === "notes" ? <>
            <span>Briefing notes</span><strong>Keep the table clear</strong><b>Voice, camera and screen sharing are ready.</b><small>Shared, host-controlled notes will be added on the same room state when the community briefing upgrade is enabled.</small>
          </> : null}
          </>}
        </div>
      </div>

      <div className="briefing-table" aria-hidden="true"><span>BAW</span><small>flight briefing</small></div>
      <nav className="briefing-console" aria-label="Briefing console">
        {(["flight-plan", "route", "weather", "notes"] as WallView[]).map((view) => <button key={view} type="button" className={wallView === view ? "active" : ""} onClick={() => setWallView(view)}><span>{view === "flight-plan" ? "Flight plan" : view}</span><small>{view === "flight-plan" ? "OFP" : view === "route" ? "MAP" : view === "weather" ? "WX" : "LOG"}</small></button>)}
      </nav>
      <div className="briefing-seat-ring" role="group" aria-label="Choose your chair">
        {seats.map(({ seatIndex, pilot: occupant }) => {
          const isOurs = occupant?.pilotId === pilot.id;
          const unavailable = Boolean(occupant && !isOurs);
          const selected = !isThisRoom && selectedSeat === seatIndex;
          return <button key={seatIndex} type="button" className={`briefing-seat ${seatPosition(seatIndex)}${selected ? " selected" : ""}${occupant ? " occupied" : ""}${isOurs ? " yours" : ""}`} aria-label={seatLabel(seatIndex, occupant)} disabled={unavailable || isThisRoom} onClick={() => setSelectedSeat(seatIndex)}>
            <span className="briefing-seat-name">{occupant ? <><PilotPortrait image={occupant.profileImage} name={occupant.name} /><span><b>{isOurs ? "You" : occupant.name}</b><small>{occupant.pilotNumber}</small><em>● Connected</em></span><strong aria-hidden="true">⌁</strong></> : <><i>{seatIndex}</i><span><b>{selected ? "Your chair" : "Open chair"}</b><small>{selected ? "Ready to join" : "Select this seat"}</small><em>○ Available</em></span><strong aria-hidden="true">＋</strong></>}</span>
          </button>;
        })}
      </div>
    </section>

    {!isThisRoom ? <p className="briefing-room-seat-note">{briefingNotice ? `${briefingNotice} ` : ""}{activeSeats ? `${activeSeats} connected pilot${activeSeats === 1 ? " has" : "s have"} not selected a chair yet. ` : ""}Chair {selectedSeat} is selected. Joining reserves it while your call is active.</p> : <p className="briefing-room-seat-note">{briefingNotice ? `${briefingNotice} ` : ""}{localSeat ? `You are seated at chair ${localSeat}.` : "You joined without a chair assignment."} Your camera and screen remain off until you choose them.</p>}
    <PeerVoiceCall room={room} pilot={pilot} seatIndex={selectedSeat} />
  </section>;
}
