"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Snapshot = {
  latitude: number;
  longitude: number;
  altitudeFt: number;
  groundSpeedKt: number;
  headingDeg: number;
  fuelKg: number | null;
  enginesRunning: boolean;
  parkingBrakeSet: boolean;
  onGround: boolean;
  verticalSpeedFpm: number | null;
};

type LiveFlight = {
  id: string;
  pilotNumber: string;
  pilotName: string;
  flightNumber: string;
  from: string;
  to: string;
  aircraft: string;
  simulator: "xplane12" | "msfs2020" | "msfs2024";
  updatedAt: string;
  distanceNm: number;
  connectionHealthy: boolean;
  lastSnapshot: Snapshot | null;
};

const simulatorLabels: Record<LiveFlight["simulator"], string> = {
  xplane12: "X-Plane 12",
  msfs2020: "MSFS 2020",
  msfs2024: "MSFS 2024",
};

function formatAge(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
}

function mapPosition(snapshot: Snapshot) {
  return {
    left: `${Math.min(99.5, Math.max(0.5, ((snapshot.longitude + 180) / 360) * 100))}%`,
    top: `${Math.min(99, Math.max(1, ((90 - snapshot.latitude) / 180) * 100))}%`,
  };
}

export function LiveOperationsMap({ initialSessions }: { initialSessions: LiveFlight[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedId, setSelectedId] = useState(initialSessions[0]?.id ?? "");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/staff/live-operations", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { sessions?: LiveFlight[] };
        if (!alive || !Array.isArray(payload.sessions)) return;
        setSessions(payload.sessions);
        setLastRefresh(new Date());
      } catch {
        // Keep displaying the last verified operations snapshot while a refresh fails.
      }
    };

    const interval = window.setInterval(refresh, 15_000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!sessions.some((session) => session.id === selectedId)) setSelectedId(sessions[0]?.id ?? "");
  }, [sessions, selectedId]);

  const selected = sessions.find((session) => session.id === selectedId) ?? null;
  const healthy = sessions.filter((session) => session.connectionHealthy).length;
  const mappedSessions = useMemo(() => sessions.filter((session) => session.lastSnapshot), [sessions]);

  return <>
    <section className="ops-shell ops-live-summary">
      <div><strong>{sessions.length}</strong><span>Active flights</span></div>
      <div><strong>{healthy}</strong><span>Healthy links</span></div>
      <div><strong>{sessions.length - healthy}</strong><span>Stale links</span></div>
      <div className="ops-live-refresh"><b>LIVE MAP</b><span>Refreshes every 15 sec · last checked {lastRefresh.toLocaleTimeString("en-GB")}</span></div>
      <Link className="ops-secondary" href="/staff">Staff Centre</Link>
    </section>

    <section className="ops-shell ops-tracker-layout">
      <div className="ops-radar-panel">
        <div className="ops-radar-head"><div><span className="ops-kicker">BAV Flight Tracker</span><h2>Live simulator operations</h2></div><span>{mappedSessions.length} positioned</span></div>
        <div className="ops-radar-map" role="region" aria-label="Live BAV flight tracking map">
          <div className="ops-radar-grid" />
          <div className="ops-radar-equator">Equator</div>
          <div className="ops-radar-label north">90°N</div><div className="ops-radar-label south">90°S</div>
          <div className="ops-radar-label west">180°W</div><div className="ops-radar-label east">180°E</div>
          {mappedSessions.map((session) => {
            const snapshot = session.lastSnapshot!;
            const position = mapPosition(snapshot);
            const selectedFlight = session.id === selectedId;
            return <button type="button" key={session.id} className={`ops-radar-flight ${selectedFlight ? "selected" : ""} ${session.connectionHealthy ? "healthy" : "stale"}`} style={position} onClick={() => setSelectedId(session.id)} aria-label={`Select ${session.flightNumber}`}>
              <i style={{ transform: `rotate(${snapshot.headingDeg}deg)` }}>▲</i><span>{session.flightNumber}</span>
            </button>;
          })}
          {!mappedSessions.length ? <div className="ops-radar-empty">Live aircraft positions appear here as soon as an active Cabin Control ACARS session sends telemetry.</div> : null}
        </div>
        <p className="ops-radar-note">Operational simulator telemetry only. This is a BAV staff view, not a public real-world flight tracker.</p>
      </div>

      <aside className="ops-radar-detail">
        {selected ? <>
          <div className="ops-radar-detail-head"><span className="ops-kicker">{selected.pilotNumber} · {simulatorLabels[selected.simulator]}</span><h2>{selected.flightNumber}</h2><p>{selected.from} → {selected.to} · {selected.aircraft}</p><span className={`ops-connection ${selected.connectionHealthy ? "healthy" : "stale"}`}>{selected.connectionHealthy ? "Connected" : "Stale"}</span></div>
          {selected.lastSnapshot ? <div className="ops-radar-data">
            <div><span>Altitude</span><strong>{Math.round(selected.lastSnapshot.altitudeFt).toLocaleString()} ft</strong></div>
            <div><span>Ground speed</span><strong>{Math.round(selected.lastSnapshot.groundSpeedKt)} kt</strong></div>
            <div><span>Heading</span><strong>{Math.round(selected.lastSnapshot.headingDeg)}°</strong></div>
            <div><span>Tracked</span><strong>{Math.round(selected.distanceNm)} NM</strong></div>
            <div><span>Position</span><strong>{selected.lastSnapshot.latitude.toFixed(3)}, {selected.lastSnapshot.longitude.toFixed(3)}</strong></div>
            <div><span>Last report</span><strong>{formatAge(selected.updatedAt)}</strong></div>
          </div> : <p className="ops-radar-waiting">ACARS session started; waiting for its first simulator position.</p>}
        </> : <div className="ops-radar-waiting"><h2>No active flights</h2><p>When a BAV pilot starts Cabin Control ACARS, the live tracker will populate automatically.</p></div>}
      </aside>
    </section>

    <section className="ops-shell ops-live-list ops-tracker-list">
      {sessions.map((session) => <button type="button" className={`ops-tracker-row ${session.id === selectedId ? "selected" : ""}`} key={session.id} onClick={() => setSelectedId(session.id)}>
        <span className={`ops-tracker-dot ${session.connectionHealthy ? "healthy" : "stale"}`} /><strong>{session.flightNumber}</strong><span>{session.from} → {session.to}</span><span>{session.pilotName}</span><span>{session.lastSnapshot ? `${Math.round(session.lastSnapshot.altitudeFt).toLocaleString()} ft` : "Awaiting position"}</span><span>{formatAge(session.updatedAt)}</span>
      </button>)}
    </section>
  </>;
}
