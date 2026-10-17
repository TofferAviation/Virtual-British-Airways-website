"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import { CREW_ROOM_BANNER_LIBRARY, DEFAULT_CREW_ROOM_BANNER_ID } from "@/lib/crew-room-banner-library";

type CrewRoomRequest = {
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
};

type Assignment = { id: string; flightNumber: string; from: string; to: string; aircraft: string; date: string; departure: string; arrival: string; duration: string } | null;

function statusCopy(status: CrewRoomRequest["status"]) {
  return status === "pending" ? "With staff" : status === "approved" ? "Approved" : status === "declined" ? "Not scheduled" : "Cancelled";
}

export function CrewRoomRequestComposer({ assignment, initialRequests }: { assignment: Assignment; initialRequests: CrewRoomRequest[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [expanded, setExpanded] = useState(false);
  const [roomName, setRoomName] = useState(assignment ? `${assignment.flightNumber} crew room` : "");
  const [welcomeNote, setWelcomeNote] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [preferences, setPreferences] = useState<("voice" | "camera" | "screen")[]>(["voice"]);
  const [bannerId, setBannerId] = useState(DEFAULT_CREW_ROOM_BANNER_ID);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingForFlight = useMemo(() => assignment ? requests.find((request) => request.status === "pending" && request.flightNumber === assignment.flightNumber && request.routeFrom === assignment.from && request.routeTo === assignment.to) ?? null : null, [assignment, requests]);

  function togglePreference(preference: "voice" | "camera" | "screen") {
    setPreferences((current) => preference === "voice"
      ? ["voice", ...current.filter((value) => value !== "voice")]
      : current.includes(preference) ? current.filter((value) => value !== preference) : [...current, preference]);
  }

  function pickBanner(value: string) {
    setBannerId(value);
    if (value !== "custom") {
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!assignment) return;
    setBusy(true);
    setNotice("");
    try {
      const form = new FormData();
      form.set("roomName", roomName);
      form.set("welcomeNote", welcomeNote);
      form.set("requestedCapacity", String(capacity));
      form.set("mediaPreferences", JSON.stringify(preferences));
      form.set("bannerId", bannerId);
      if (file) form.set("banner", file);
      const response = await fetch("/api/flight-companion/crew-room-requests", { method: "POST", body: form });
      const body = await response.json().catch(() => null) as { error?: string; request?: CrewRoomRequest } | null;
      if (!response.ok || !body?.request) throw new Error(body?.error || "Your crew-room request could not be sent.");
      setRequests((current) => [body.request!, ...current]);
      setExpanded(false);
      setNotice("Your request is with BAV staff. We will notify you after it is reviewed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your crew-room request could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="flight-companion-room-request" aria-labelledby="flight-companion-room-request-title">
    <header><div><span className="flight-companion-kicker">HOST A CREW ROOM</span><h2 id="flight-companion-room-request-title">Bring your flight together</h2><p>Ask BAV staff to open a small room for your saved flight. Pick a Lounge banner or send your own for review.</p></div>{assignment ? <span className="flight-companion-room-request-flight">{assignment.flightNumber} · {assignment.from} → {assignment.to}</span> : null}</header>
    {!assignment ? <div className="flight-companion-room-request-empty"><strong>Choose a BAV flight first</strong><span>Once your assignment is saved, its route and timing are brought into the request automatically.</span><Link href="/book">Find a BAV flight</Link></div> : pendingForFlight ? <div className="flight-companion-room-request-pending"><strong>{pendingForFlight.roomName} is with staff</strong><span>{pendingForFlight.requestedCapacity} requested seats · {pendingForFlight.hasCustomBanner ? "custom banner under review" : "BAV banner selected"}</span><small>Staff will decide when to schedule or open the room, then notify you.</small></div> : <>
      <div className="flight-companion-room-request-actions"><div><b>{capacity} seats</b><span>Choose 2–8 pilots. Four is a comfortable default for camera and screen sharing.</span></div><button type="button" className="flight-companion-primary" onClick={() => setExpanded((current) => !current)}>{expanded ? "Close request" : "Request a crew room"}</button></div>
      {expanded ? <form className="flight-companion-room-request-form" onSubmit={submit}>
        <label><span>Room name</span><input required maxLength={80} value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Miami arrival crew" /></label>
        <label><span>Welcome note</span><textarea required rows={3} maxLength={240} value={welcomeNote} onChange={(event) => setWelcomeNote(event.target.value)} placeholder="Invite pilots to plan the route, share a departure time or meet in voice." /></label>
        <div className="flight-companion-room-request-options"><label><span>Requested seats</span><select value={capacity} onChange={(event) => setCapacity(Number(event.target.value))}>{[2, 3, 4, 5, 6, 7, 8].map((size) => <option key={size} value={size}>{size} pilots</option>)}</select></label><fieldset><legend>Room ready for</legend><label><input checked={preferences.includes("voice")} type="checkbox" disabled /> Voice chat</label><label><input checked={preferences.includes("camera")} type="checkbox" onChange={() => togglePreference("camera")} /> Camera</label><label><input checked={preferences.includes("screen")} type="checkbox" onChange={() => togglePreference("screen")} /> Screen share</label></fieldset></div>
        <fieldset className="flight-companion-banner-picker"><legend>Room banner</legend><div>{CREW_ROOM_BANNER_LIBRARY.map((banner) => <button className={bannerId === banner.id ? "selected" : ""} type="button" key={banner.id} onClick={() => pickBanner(banner.id)}><span style={{ backgroundImage: `linear-gradient(90deg, rgba(4,19,39,.45), rgba(4,19,39,.06)), url("${banner.image}")`, backgroundPosition: banner.position }} /><strong>{banner.name}</strong><small>{banner.description}</small></button>)}<button className={bannerId === "custom" ? "selected upload" : "upload"} type="button" onClick={() => { pickBanner("custom"); fileInput.current?.click(); }}><span className="flight-companion-banner-upload-mark">+</span><strong>Upload my own</strong><small>{file ? file.name : "JPG or PNG · max 5 MB"}</small></button></div><input ref={fileInput} hidden type="file" accept="image/jpeg,image/png" onChange={(event) => { const next = event.currentTarget.files?.[0] ?? null; setFile(next); if (next) setBannerId("custom"); }} /></fieldset>
        <footer><p>Your custom banner is private until staff approve the room. Audio, camera and screens are never recorded by BAV.</p><button className="flight-companion-primary" disabled={busy} type="submit">{busy ? "Sending request…" : "Send to BAV staff"}</button></footer>
      </form> : null}
    </>}
    {notice ? <p className="flight-companion-room-request-notice" role="status">{notice}</p> : null}
    {requests.length ? <div className="flight-companion-room-request-history"><strong>Your recent room requests</strong>{requests.slice(0, 3).map((request) => <div key={request.id}><span className={request.status}>{statusCopy(request.status)}</span><b>{request.roomName}</b><small>{request.flightNumber} · {request.routeFrom} → {request.routeTo}{request.staffNote ? ` · ${request.staffNote}` : ""}</small>{request.status === "approved" ? <Link href="/crew-lounge">Open lounge →</Link> : null}</div>)}</div> : null}
  </section>;
}
