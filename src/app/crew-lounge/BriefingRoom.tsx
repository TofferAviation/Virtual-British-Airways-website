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

type WallView = "briefing" | "route" | "weather" | "notes";

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
  const [wallView, setWallView] = useState<WallView>("briefing");
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
    </header>

    <section className="briefing-room-scene" aria-label="Briefing room seat plan and shared presentation wall">
      <div className="briefing-wall" aria-live="polite">
        <nav aria-label="Briefing wall views">
          {(["briefing", "route", "weather", "notes"] as WallView[]).map((view) => <button key={view} type="button" className={wallView === view ? "active" : ""} onClick={() => setWallView(view)}>{view}</button>)}
        </nav>
        <div className={`briefing-wall-content${presentationStream ? " is-presenting" : ""}`}>
          {presentationStream ? <><PresentationVideo stream={presentationStream} /><span className="briefing-presentation-label">Live presentation · {presentationPilot}</span></> : <>
          {wallView === "briefing" ? <>
            <span>British Airways Virtual · pre-flight brief</span>
            <strong>{briefing ? briefing.title : "Crew briefing"}</strong>
            <b>{briefing ? `${briefing.route.from}  →  ${briefing.route.to}` : "Choose a linked event to populate the route"}</b>
            <small>{briefing ? `${briefing.route.fromName} to ${briefing.route.toName} · ${formattedDate(briefing.date)} · ${briefing.startUtc}Z` : "The wall is deliberately separate from pilots’ private bookings."}</small>
          </> : null}
          {wallView === "route" ? <>
            <span>Route overview</span><strong>{briefing ? `${briefing.route.from} — ${briefing.route.to}` : "Route awaiting briefing selection"}</strong><div className="briefing-route-line"><i /> <em>✈</em> <i /></div><small>{briefing ? briefing.aircraftNote : "A host can use screen share for a live SimBrief, chart, or route review."}</small>
          </> : null}
          {wallView === "weather" ? <>
            <span>Weather desk</span><strong>Live weather is not invented</strong><b>{briefing ? `${briefing.route.from} & ${briefing.route.to}` : "Departure & destination"}</b><small>Use the shared-screen control for a live METAR, TAF, or weather source during this free pilot-room release.</small>
          </> : null}
          {wallView === "notes" ? <>
            <span>Briefing notes</span><strong>Keep the table clear</strong><b>Voice, camera and screen sharing are ready.</b><small>Shared, host-controlled notes will be added on the same room state when the community briefing upgrade is enabled.</small>
          </> : null}
          </>}
        </div>
      </div>

      <div className="briefing-table" aria-hidden="true"><span>BAW</span><small>flight briefing</small></div>
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

    {!isThisRoom ? <p className="briefing-room-seat-note">{activeSeats ? `${activeSeats} connected pilot${activeSeats === 1 ? " has" : "s have"} not selected a chair yet. ` : ""}Chair {selectedSeat} is selected. Joining reserves it while your call is active.</p> : <p className="briefing-room-seat-note">{localSeat ? `You are seated at chair ${localSeat}.` : "You joined without a chair assignment."} Your camera and screen remain off until you choose them.</p>}
    <PeerVoiceCall room={room} pilot={pilot} seatIndex={selectedSeat} />
  </section>;
}
