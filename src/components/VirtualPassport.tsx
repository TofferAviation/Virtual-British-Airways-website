"use client";

import { useState, type CSSProperties } from "react";
import type { PilotPirep } from "@/lib/pilot-operations-store";
import { passportTheme, type PassportNationality } from "@/lib/passport-nationalities";
import { virtualPassportStamps } from "@/lib/virtual-passport";

const STAMPS_PER_PAGE = 4;
type PageTurn = { direction: "forward" | "back"; nextPage: number };

export function VirtualPassport({ pireps, pilotName, pilotNumber, nationality }: { pireps: readonly PilotPirep[]; pilotName: string; pilotNumber: string; nationality: PassportNationality }) {
  const stamps = virtualPassportStamps(pireps);
  const pages = Array.from({ length: Math.max(1, Math.ceil(stamps.length / STAMPS_PER_PAGE)) }, (_, index) => stamps.slice(index * STAMPS_PER_PAGE, (index + 1) * STAMPS_PER_PAGE));
  const theme = passportTheme(nationality);
  const [isOpen, setIsOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [turn, setTurn] = useState<PageTurn | null>(null);
  const palette = { "--passport-cover": theme.cover, "--passport-edge": theme.edge, "--passport-gold": theme.ink } as CSSProperties;
  const page = pages[pageIndex];

  function turnPage(nextPage: number) {
    if (turn || nextPage < 0 || nextPage >= pages.length) return;
    const direction = nextPage > pageIndex ? "forward" : "back";
    setTurn({ direction, nextPage });
    window.setTimeout(() => setPageIndex(nextPage), 290);
  }

  if (!isOpen) return <section className="account-v2-passport passport-real-shell" style={palette} aria-labelledby="passport-heading">
    <button className="passport-real-cover" type="button" onClick={() => setIsOpen(true)} aria-describedby="passport-open-help">
      <span className="passport-real-flag" aria-hidden="true">{theme.flag}</span>
      <span className="passport-real-cover-title" id="passport-heading">{nationality.toUpperCase()}</span>
      <span className="passport-real-cover-subtitle">VIRTUAL PASSPORT</span>
      <span className="passport-real-cover-rule" aria-hidden="true" />
      <span className="passport-real-cover-caption">BRITISH AIRWAYS VIRTUAL</span>
    </button>
    <p className="passport-real-open-help" id="passport-open-help">Open your virtual passport · {stamps.length} recorded arrival{stamps.length === 1 ? "" : "s"}</p>
  </section>;

  return <section className="account-v2-passport passport-real-shell is-open" style={palette} aria-labelledby="passport-heading">
    <div className="passport-real-toolbar"><div><p>BRITISH AIRWAYS VIRTUAL · {nationality.toUpperCase()}</p><h2 id="passport-heading">Your virtual passport</h2></div><button type="button" onClick={() => setIsOpen(false)}>Close passport</button></div>
    <div className="passport-real-book">
      <section className="passport-real-identity">
        <span className="passport-real-watermark" aria-hidden="true">{theme.flag}</span>
        <p className="passport-real-page-label">VIRTUAL PILOT IDENTITY</p>
        <div className="passport-real-photo" aria-hidden="true">{pilotName.slice(0, 1).toUpperCase()}</div>
        <dl><div><dt>PILOT</dt><dd>{pilotName}</dd></div><div><dt>BAV PILOT ID</dt><dd>{pilotNumber}</dd></div><div><dt>PASSPORT NATIONALITY</dt><dd>{nationality}</dd></div></dl>
        <small>Created for flight-simulation records only.</small>
      </section>
      <section className="passport-real-record-page" aria-live="polite" aria-atomic="true">
        <div className="passport-real-page-header"><span>ARRIVAL STAMPS</span><b>{pageIndex + 1} / {pages.length}</b></div>
        {page.length ? <div className="account-v2-passport-grid">{page.map((stamp) => <article key={stamp.id} className={"account-v2-passport-stamp" + (stamp.weathered ? " is-weathered" : "")} style={{ "--passport-ink": stamp.ink, "--passport-rotation": stamp.rotation + "deg" } as CSSProperties}>
          <div className="account-v2-passport-copy"><span>{stamp.flightNumber}</span><strong>{stamp.airportCode}</strong><p>{stamp.airportName}</p><small>{stamp.country}</small></div>
          <div className="account-v2-passport-seal" aria-label={["Arrived", stamp.completedDate, "at", stamp.completedTime].join(" ")}><span>ARRIVED</span><b>{stamp.completedDate}</b><em>{stamp.completedTime}</em><i>BAV</i></div>
        </article>)}</div> : <p className="account-v2-passport-empty">Your flight records will appear here after a BAV PIREP is submitted.</p>}
        <div className="passport-real-controls"><button type="button" onClick={() => turnPage(pageIndex - 1)} disabled={pageIndex === 0 || Boolean(turn)}>← Previous</button><span>Turn page</span><button type="button" onClick={() => turnPage(pageIndex + 1)} disabled={pageIndex === pages.length - 1 || Boolean(turn)}>Next →</button></div>
        {turn ? <span className={"passport-real-turning-sheet is-turning-" + turn.direction} onAnimationEnd={() => setTurn(null)} aria-hidden="true" /> : null}
      </section>
    </div>
    <p className="account-v2-passport-note">Virtual airline keepsake only — not an official travel or immigration document.</p>
  </section>;
}
