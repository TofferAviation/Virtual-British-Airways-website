"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CurrentFlightStatus as CurrentFlightStatusRow } from "@/lib/flight-status";

function duration(minutes: number | null) {
  if (minutes == null) return "Awaiting estimate";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function CurrentFlightStatus({ initialFlights }: { initialFlights: CurrentFlightStatusRow[] }) {
  const [flights, setFlights] = useState(initialFlights);
  const [checkedAt, setCheckedAt] = useState(new Date());

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/flight-status", { cache: "no-store" });
        const payload = await response.json() as { flights?: CurrentFlightStatusRow[] };
        if (live && response.ok && Array.isArray(payload.flights)) {
          setFlights(payload.flights);
          setCheckedAt(new Date());
        }
      } catch {
        // Keep the most recently verified operational view on a transient failure.
      }
    };
    const interval = window.setInterval(refresh, 15_000);
    return () => { live = false; window.clearInterval(interval); };
  }, []);

  return <section className="flight-status-panel" aria-live="polite">
    <div className="flight-status-panel-head"><div><span className="section-kicker">BAV OPERATIONS</span><h2>Current flights</h2><p>Live ACARS sessions refresh every 15 seconds.</p></div><div className="flight-status-refresh"><i /><strong>{flights.length} live</strong><span>Checked {checkedAt.toLocaleTimeString("en-GB")}</span></div></div>
    {flights.length ? <div className="flight-status-list">{flights.map((flight) => <article key={flight.id} className="flight-status-row"><div className="flight-status-flight"><span className={flight.connectionHealthy ? "flight-status-signal" : "flight-status-signal delayed"} /><div><strong>{flight.callsign}</strong><small>{flight.flightNumber} · {flight.aircraft}</small></div></div><div className="flight-status-pilot"><span>Pilot</span><strong>{flight.pilotName}</strong><small>{flight.pilotNumber} · {flight.phase}</small></div><div className="flight-status-route"><span>Route</span><strong>{flight.from} <b>→</b> {flight.to}</strong><small>{flight.connectionHealthy ? "Live ACARS connection" : "Telemetry delayed"}</small></div><div className="flight-status-progress"><div><span>Flight progress</span><strong>{flight.progressPercent == null ? "—" : `${flight.progressPercent}%`}</strong></div><div className="flight-status-track" aria-label={flight.progressPercent == null ? "Flight progress awaiting schedule" : `${flight.progressPercent}% schedule progress`}><i style={{ width: `${flight.progressPercent ?? 0}%` }} /></div><small>Flying {duration(flight.elapsedMinutes)} · {flight.remainingMinutes == null ? "remaining time awaiting estimate" : `${duration(flight.remainingMinutes)} remaining`}</small></div></article>)}</div> : <div className="flight-status-empty"><strong>No BAV aircraft are currently airborne or active.</strong><span>Live flights appear here as soon as a pilot starts a Cabin Control ACARS session.</span></div>}
    <div className="flight-status-foot"><span>Progress is calculated from ACARS start time and the SimBrief block-time estimate when one is available.</span><Link href="/ba-radar">Open BA-Radar live map →</Link></div>
  </section>;
}
