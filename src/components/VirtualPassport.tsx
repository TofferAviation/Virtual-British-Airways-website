import type { CSSProperties } from "react";
import type { PilotPirep } from "@/lib/pilot-operations-store";
import { virtualPassportStamps } from "@/lib/virtual-passport";

export function VirtualPassport({ pireps }: { pireps: readonly PilotPirep[] }) {
  const stamps = virtualPassportStamps(pireps);
  const countries = new Set(stamps.map((stamp) => stamp.country).filter((country) => country !== "Destination country"));

  return <section className="account-v2-passport" id="passport" aria-labelledby="passport-heading">
    <div className="account-v2-passport-heading">
      <div><p className="account-v2-passport-kicker">BAV flight record</p><h2 id="passport-heading">Virtual passport</h2><p>Arrival stamps are created from each recorded BAV flight, including your existing eligible PIREPs.</p></div>
      <div className="account-v2-passport-summary"><strong>{stamps.length}</strong><span>arrival{stamps.length === 1 ? "" : "s"}</span><small>{countries.size} countr{countries.size === 1 ? "y" : "ies"}</small></div>
    </div>
    {stamps.length ? <div className="account-v2-passport-grid">{stamps.map((stamp) => <article key={stamp.id} className={`account-v2-passport-stamp${stamp.weathered ? " is-weathered" : ""}`} style={{ "--passport-ink": stamp.ink, "--passport-rotation": `${stamp.rotation}deg` } as CSSProperties}>
      <div className="account-v2-passport-copy"><span>{stamp.flightNumber}</span><strong>{stamp.airportCode}</strong><p>{stamp.airportName}</p><small>{stamp.country}</small></div>
      <div className="account-v2-passport-seal" aria-label={`Arrived ${stamp.completedDate} at ${stamp.completedTime}`}><span>ARRIVED</span><b>{stamp.completedDate}</b><em>{stamp.completedTime}</em><i>BAV</i></div>
    </article>)}</div> : <p className="account-v2-passport-empty">Your recorded arrivals will appear here after a BAV flight report is submitted.</p>}
    <p className="account-v2-passport-note">Virtual airline keepsake only — not an official travel or immigration document.</p>
  </section>;
}

