"use client";

import { useMemo, useState } from "react";
import { crewRoomBannerById } from "@/lib/crew-room-banner-library";

type MediaPreference = "voice" | "camera" | "screen";
type VoiceRoom = { id: string; name: string; status: "scheduled" | "open" | "closed"; maxParticipants: number };
type CrewRoomRequest = {
  id: string;
  pilotNumber: string;
  pilotName: string;
  pilotRank: string;
  flightNumber: string;
  routeFrom: string;
  routeTo: string;
  aircraft: string;
  flightDate: string;
  departureTime: string;
  roomName: string;
  welcomeNote: string;
  requestedCapacity: number;
  mediaPreferences: MediaPreference[];
  bannerId: string;
  hasCustomBanner: boolean;
  status: "pending" | "approved" | "declined" | "cancelled";
  staffNote: string | null;
  voiceRoomId: string | null;
  createdAt: string;
};

type ReviewDraft = { capacity: number; status: "scheduled" | "open"; note: string };

function statusCopy(status: CrewRoomRequest["status"]) {
  return status === "pending" ? "Awaiting review" : status === "approved" ? "Published" : status === "declined" ? "Not scheduled" : "Cancelled";
}

export function CrewRoomRequestBoard({ initialRequests }: { initialRequests: CrewRoomRequest[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const pending = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);

  function draftFor(request: CrewRoomRequest) {
    return drafts[request.id] ?? { capacity: request.requestedCapacity, status: "scheduled", note: "" };
  }

  function updateDraft(request: CrewRoomRequest, patch: Partial<ReviewDraft>) {
    setDrafts((current) => ({ ...current, [request.id]: { ...draftFor(request), ...patch } }));
  }

  async function review(request: CrewRoomRequest, action: "approve" | "decline") {
    const draft = draftFor(request);
    setBusyId(request.id);
    setNotice("");
    try {
      const response = await fetch("/api/staff/voice-room-requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id: request.id, capacity: draft.capacity, status: draft.status, staffNote: draft.note }),
      });
      const body = await response.json().catch(() => null) as { error?: string; request?: CrewRoomRequest; room?: VoiceRoom } | null;
      if (!response.ok || !body?.request) throw new Error(body?.error || "The crew-room request could not be reviewed.");
      setRequests((current) => current.map((item) => item.id === body.request!.id ? body.request! : item));
      setNotice(action === "approve" ? `“${request.roomName}” is now on the Crew Lounge board. The pilot has been notified.` : `“${request.roomName}” was reviewed and the pilot has been notified.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The crew-room request could not be reviewed.");
    } finally {
      setBusyId(null);
    }
  }

  return <section className="voice-room-request-board" aria-labelledby="voice-room-request-title">
    <header className="voice-room-request-board-head"><div><span className="staff-kicker">Pilot requests</span><h2 id="voice-room-request-title">Hosted flight rooms</h2><p>Review a flight plan, requested seats and banner before the room reaches pilots.</p></div><span className={pending.length ? "attention" : ""}>{pending.length} waiting</span></header>
    {notice ? <p className="voice-room-request-notice" role="status">{notice}</p> : null}
    {requests.length ? <div className="voice-room-request-list">{requests.map((request) => {
      const banner = crewRoomBannerById(request.bannerId);
      const draft = draftFor(request);
      const busy = busyId === request.id;
      return <article className={`voice-room-request ${request.status}`} key={request.id}>
        <div className="voice-room-request-banner" style={request.hasCustomBanner ? { backgroundImage: `url("/api/staff/voice-room-requests/${encodeURIComponent(request.id)}/banner")` } : { backgroundImage: `linear-gradient(90deg, rgba(4,19,39,.46), rgba(4,19,39,.08)), url("${banner.image}")`, backgroundPosition: banner.position }}><span>{request.hasCustomBanner ? "Custom pilot banner" : banner.name}</span></div>
        <div className="voice-room-request-copy">
          <header><div><span className={`voice-room-status ${request.status === "pending" ? "scheduled" : request.status === "approved" ? "open" : "closed"}`}>{statusCopy(request.status)}</span><h3>{request.roomName}</h3><p>{request.flightNumber} · {request.routeFrom} → {request.routeTo} · {request.aircraft}</p></div><time dateTime={request.flightDate}>{request.flightDate}<small>Departs {request.departureTime}</small></time></header>
          <p className="voice-room-request-note">{request.welcomeNote}</p>
          <dl><div><dt>Host</dt><dd>{request.pilotNumber} · {request.pilotName}</dd></div><div><dt>Requested room</dt><dd>{request.requestedCapacity} pilots · {request.mediaPreferences.join(", ")}</dd></div><div><dt>Banner</dt><dd>{request.hasCustomBanner ? "Custom upload" : banner.name}</dd></div></dl>
          {request.status === "pending" ? <div className="voice-room-request-review"><label>Confirmed seats<select value={draft.capacity} onChange={(event) => updateDraft(request, { capacity: Number(event.target.value) })}>{[2, 3, 4, 5, 6, 7, 8].map((size) => <option key={size} value={size}>{size} pilots</option>)}</select></label><label>When approved<select value={draft.status} onChange={(event) => updateDraft(request, { status: event.target.value as ReviewDraft["status"] })}><option value="scheduled">Schedule on the board</option><option value="open">Open now</option></select></label><label className="wide">Note to pilot <em>optional</em><textarea rows={2} maxLength={320} value={draft.note} onChange={(event) => updateDraft(request, { note: event.target.value })} placeholder="A welcome, timing update, or reason for the decision." /></label><footer><button type="button" className="staff-secondary-button" disabled={busyId !== null} onClick={() => void review(request, "decline")}>Decline</button><button type="button" className="staff-primary-button" disabled={busyId !== null} onClick={() => void review(request, "approve")}>{busy ? "Saving…" : "Approve room"}</button></footer></div> : <div className="voice-room-request-reviewed"><strong>{request.status === "approved" ? "Published to the Crew Lounge" : "Review completed"}</strong><span>{request.staffNote || "No further note was added."}</span></div>}
        </div>
      </article>;
    })}</div> : <div className="voice-room-empty"><strong>No pilot requests yet</strong><span>When a pilot has a saved flight and asks to host a room, it will appear here for review.</span></div>}
  </section>;
}
