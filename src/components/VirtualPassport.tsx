"use client";

import { useState, type CSSProperties } from "react";
import type { PilotPirep } from "@/lib/pilot-operations-store";
import { virtualPassportStamps } from "@/lib/virtual-passport";

const STAMPS_PER_PAGE = 4;

export function VirtualPassport({ pireps }: { pireps: readonly PilotPirep[] }) {
  const stamps = virtualPassportStamps(pireps);
  const pages = Array.from({ length: Math.max(1, Math.ceil(stamps.length / STAMPS_PER_PAGE)) }, (_, index) => stamps.slice(index * STAMPS_PER_PAGE, (index + 1) * STAMPS_PER_PAGE));
  const countries = new Set(stamps.map((stamp) => stamp.country).filter((country) => country !== "Destination country"));
  const [isOpen, setIsOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [turn, setTurn] = useState<"forward" | "back" | null>(null);
  const page = pages[pageIndex];
  const pageClass = "account-v2-passport-stamp-page" + (turn ? " is-turning-" + turn : "");

  function changePage(next: number) {
    setTurn(next > pageIndex ? "forward" : "back");
    setPageIndex(next);
  }

  if (!isOpen) return <section className="account-v2-passport account-v2-passport-book-shell" aria-labelledby="passport-heading">
    <button className="account-v2-passport-cover" type="button" onClick={() => setIsOpen(true)} aria-describedby="passport-open-help">
      <span className="account-v2-passport-cover-mark" aria-hidden="true">✦</span>
      <span className="account-v2-passport-cover-title" id="passport-heading">BAV<br />PASSPORT</span>
      <span className="account-v2-passport-cover-rule" aria-hidden="true" />
      <span className="account-v2-passport-cover-caption">{stamps.length} recorded arrival{stamps.length === 1 ? "" : "s"}</span>
    </button>
    <p className="account-v2-passport-open-help" id="passport-open-help">Open your virtual passport to browse your arrival stamps.</p>
  </section>;

  return <section className="account-v2-passport account-v2-passport-book-shell is-open" aria-labelledby="passport-heading">
    <div className="account-v2-passport-book-toolbar"><div><p className="account-v2-passport-kicker">BAV flight record</p><h2 id="passport-heading">Virtual passport</h2></div><button className="account-v2-passport-close" type="button" onClick={() => setIsOpen(false)}>Close passport</button></div>
    <div className="account-v2-passport-book" aria-live="polite">
      <section className="account-v2-passport-inside-cover"><span className="account-v2-passport-inside-mark" aria-hidden="true">✦</span><p>British Airways Virtual</p><strong>{stamps.length}</strong><span>arrival stamps</span><small>{countries.size} countr{countries.size === 1 ? "y" : "ies"} recorded</small><em>Virtual airline keepsake</em></section>
      <section className={pageClass} key={pageIndex} onAnimationEnd={() => setTurn(null)}>
        <div className="account-v2-passport-page-header"><span>ARRIVAL RECORDS</span><b>PAGE {pageIndex + 1} / {pages.length}</b></div>
        {page.length ? <div className="account-v2-passport-grid">{page.map((stamp) => <article key={stamp.id} className={"account-v2-passport-stamp" + (stamp.weathered ? " is-weathered" : "")} style={{ "--passport-ink": stamp.ink, "--passport-rotation": stamp.rotation + "deg" } as CSSProperties}>
          <div className="account-v2-passport-copy"><span>{stamp.flightNumber}</span><strong>{stamp.airportCode}</strong><p>{stamp.airportName}</p><small>{stamp.country}</small></div>
          <div className="account-v2-passport-seal" aria-label={["Arrived", stamp.completedDate, "at", stamp.completedTime].join(" ")}><span>ARRIVED</span><b>{stamp.completedDate}</b><em>{stamp.completedTime}</em><i>BAV</i></div>
        </article>)}</div> : <p className="account-v2-passport-empty">No BAV flight reports have been recorded yet.</p>}
        <div className="account-v2-passport-page-controls"><button type="button" onClick={() => changePage(pageIndex - 1)} disabled={pageIndex === 0} aria-label="Previous passport page">← Previous</button><span>Turn the page</span><button type="button" onClick={() => changePage(pageIndex + 1)} disabled={pageIndex === pages.length - 1} aria-label="Next passport page">Next →</button></div>
      </section>
    </div>
    <p className="account-v2-passport-note">Virtual airline keepsake only — not an official travel or immigration document.</p>
  </section>;
}
