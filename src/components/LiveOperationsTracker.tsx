"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Snapshot = { latitude: number; longitude: number; altitudeFt: number; groundSpeedKt: number; headingDeg: number; fuelKg: number | null; enginesRunning: boolean; parkingBrakeSet: boolean; onGround: boolean; verticalSpeedFpm: number | null };
type LiveFlight = { id: string; pilotNumber: string; pilotName: string; flightNumber: string; from: string; to: string; aircraft: string; simulator: "xplane12" | "msfs2020" | "msfs2024"; updatedAt: string; distanceNm: number; connectionHealthy: boolean; lastSnapshot: Snapshot | null; recentSnapshots?: Snapshot[] };
type ConnectionFilter = "all" | "healthy" | "stale";

const simulatorLabels: Record<LiveFlight["simulator"], string> = { xplane12: "X-Plane 12", msfs2020: "MSFS 2020", msfs2024: "MSFS 2024" };

function mapPoint(snapshot: Pick<Snapshot, "latitude" | "longitude">) { return { x: Math.min(996, Math.max(4, ((snapshot.longitude + 180) / 360) * 1000)), y: Math.min(496, Math.max(4, ((90 - snapshot.latitude) / 180) * 500)) }; }
function mapPosition(snapshot: Snapshot) { const point = mapPoint(snapshot); return { left: `${point.x / 10}%`, top: `${point.y / 5}%` }; }
function age(value: string) { const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000)); return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`; }
function phase(snapshot: Snapshot | null) { if (!snapshot) return "Awaiting position"; if (snapshot.onGround && snapshot.enginesRunning) return "Ground operations"; if (snapshot.onGround) return "At stand"; if (snapshot.altitudeFt < 10_000) return "Climb / descent"; return "Cruise"; }

export function LiveOperationsTracker({ initialSessions }: { initialSessions: LiveFlight[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [filter, setFilter] = useState<ConnectionFilter>("all");
  const [selectedId, setSelectedId] = useState(initialSessions[0]?.id ?? "");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/staff/live-operations", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { sessions?: LiveFlight[] };
        if (!active || !Array.isArray(payload.sessions)) return;
        setSessions(payload.sessions);
        setLastRefresh(new Date());
      } catch { /* Continue displaying the last verified operations snapshot. */ }
    };
    const interval = window.setInterval(refresh, 15_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const visible = useMemo(() => sessions.filter((session) => filter === "all" || session.connectionHealthy === (filter === "healthy")), [sessions, filter]);
  useEffect(() => { if (!visible.some((session) => session.id === selectedId)) setSelectedId(visible[0]?.id ?? ""); }, [visible, selectedId]);
  const selected = visible.find((session) => session.id === selectedId) ?? null;
  const healthy = sessions.filter((session) => session.connectionHealthy).length;
  const positioned = visible.filter((session) => session.lastSnapshot);
  const trail = selected?.recentSnapshots?.filter((snapshot) => Number.isFinite(snapshot.latitude) && Number.isFinite(snapshot.longitude)) ?? [];
  const trailPoints = trail.map(mapPoint).map((point) => `${point.x},${point.y}`).join(" ");

  return <>
    <section className="ops-shell tracker-summary">
      <div><strong>{sessions.length}</strong><span>Active flights</span></div><div><strong>{healthy}</strong><span>Healthy links</span></div><div><strong>{sessions.length - healthy}</strong><span>Stale links</span></div>
      <div className="tracker-refresh"><b>LIVE OPERATIONS</b><span>15 sec refresh · checked {lastRefresh.toLocaleTimeString("en-GB")}</span></div><Link className="ops-secondary" href="/staff">Staff Centre</Link>
    </section>
    <section className="ops-shell tracker-workspace">
      <div className="tracker-map-card">
        <header className="tracker-map-header"><div><span className="ops-kicker">BAV Flight Tracker</span><h2>Active simulator flights</h2></div><div className="tracker-filter" aria-label="Connection filter">{(["all", "healthy", "stale"] as const).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? `All ${sessions.length}` : value === "healthy" ? `Connected ${healthy}` : `Stale ${sessions.length - healthy}`}</button>)}</div></header>
        <div className="tracker-map" role="region" aria-label="Live BAV flight tracking map">
          <svg className="tracker-world" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true"><path d="M82 84 133 56 202 71 234 111 219 150 178 162 146 191 110 167 91 128zM246 210 289 220 313 261 307 331 278 420 249 398 254 328 229 281zM448 78 529 59 610 76 665 115 641 150 569 148 543 177 476 159 437 125zM518 194 583 189 637 225 649 297 614 354 579 430 524 394 494 313 503 250zM702 104 766 82 842 101 891 142 870 185 813 176 786 207 733 183zM852 342 894 360 910 405 878 439 841 409z" /><path className="tracker-latitude" d="M0 83H1000M0 167H1000M0 250H1000M0 333H1000M0 417H1000M125 0V500M250 0V500M375 0V500M500 0V500M625 0V500M750 0V500M875 0V500" />{trailPoints ? <polyline className="tracker-trail" points={trailPoints} /> : null}</svg>
          <span className="tracker-coordinate tracker-north">90°N</span><span className="tracker-coordinate tracker-south">90°S</span><span className="tracker-coordinate tracker-west">180°W</span><span className="tracker-coordinate tracker-east">180°E</span>
          {positioned.map((session) => { const snapshot = session.lastSnapshot!; return <button type="button" key={session.id} className={`tracker-aircraft ${session.id === selectedId ? "selected" : ""} ${session.connectionHealthy ? "healthy" : "stale"}`} style={mapPosition(snapshot)} onClick={() => setSelectedId(session.id)} aria-label={`Select ${session.flightNumber}`}><i style={{ transform: `rotate(${snapshot.headingDeg}deg)` }}>▲</i><span>{session.flightNumber}</span></button>; })}
          {!positioned.length ? <div className="tracker-empty">Aircraft appear here once an active Cabin Control session sends its first position report.</div> : null}
        </div>
        <footer className="tracker-map-footer"><span>{positioned.length} aircraft positioned</span><span>{selected && trail.length > 1 ? `${trail.length} recent position reports shown for ${selected.flightNumber}` : "Select an aircraft to inspect its live flight trail"}</span><span>Internal BAV simulator operations only</span></footer>
      </div>
      <aside className="tracker-detail-card">{selected ? <><span className="ops-kicker">{selected.pilotNumber} · {simulatorLabels[selected.simulator]}</span><h2>{selected.flightNumber}</h2><p className="tracker-route">{selected.from} <b>→</b> {selected.to}</p><p className="tracker-pilot">{selected.pilotName} · {selected.aircraft}</p><span className={`ops-connection ${selected.connectionHealthy ? "healthy" : "stale"}`}>{selected.connectionHealthy ? "Connected" : "Stale"}</span><div className="tracker-phase"><span>Current phase</span><strong>{phase(selected.lastSnapshot)}</strong></div>{selected.lastSnapshot ? <div className="tracker-data"><div><span>Altitude</span><strong>{Math.round(selected.lastSnapshot.altitudeFt).toLocaleString()} ft</strong></div><div><span>Ground speed</span><strong>{Math.round(selected.lastSnapshot.groundSpeedKt)} kt</strong></div><div><span>Heading</span><strong>{Math.round(selected.lastSnapshot.headingDeg)}°</strong></div><div><span>Tracked</span><strong>{Math.round(selected.distanceNm)} NM</strong></div><div><span>Position</span><strong>{selected.lastSnapshot.latitude.toFixed(3)}, {selected.lastSnapshot.longitude.toFixed(3)}</strong></div><div><span>Last report</span><strong>{age(selected.updatedAt)}</strong></div></div> : <p className="tracker-awaiting">ACARS is connected but has not yet supplied a simulator position.</p>}</> : <div className="tracker-awaiting"><h2>No live flights</h2><p>Active Cabin Control ACARS flights will appear here automatically.</p></div>}</aside>
    </section>
    <section className="ops-shell tracker-list">{visible.length ? visible.map((session) => <button type="button" key={session.id} className={session.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(session.id)}><i className={session.connectionHealthy ? "healthy" : "stale"} /><strong>{session.flightNumber}</strong><span>{session.from} → {session.to}</span><span>{session.pilotName}</span><span>{phase(session.lastSnapshot)}</span><span>{session.lastSnapshot ? `${Math.round(session.lastSnapshot.altitudeFt).toLocaleString()} ft` : "Awaiting position"}</span><small>{age(session.updatedAt)}</small></button>) : <div className="tracker-list-empty">No flights match this connection filter.</div>}</section>
  </>;
}
