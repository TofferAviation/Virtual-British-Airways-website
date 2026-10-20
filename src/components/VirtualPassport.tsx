"use client";

import { useState, type CSSProperties } from "react";
import type { PilotPirep } from "@/lib/pilot-operations-store";
import { passportTheme, type PassportNationality } from "@/lib/passport-nationalities";
import type { PassportStudio } from "@/lib/passport-studio";
import { virtualPassportStamps } from "@/lib/virtual-passport";

const STAMPS_PER_PAGE = 4;
type PageTurn = { direction: "forward" | "back"; nextPage: number };

function PassportLayers({ studio, surface }: { studio: PassportStudio; surface: "cover" | "interior" }) {
  return <div className="passport-real-custom-layers" aria-label="Personal passport design">
    {studio.layers.filter((layer) => layer.surface === surface).map((layer) => <span key={layer.id} className={`passport-real-custom-layer passport-real-custom-layer-${layer.kind}`} style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, height: `${layer.height}%`, color: layer.color, borderColor: layer.outline, borderWidth: layer.outlineWidth } as CSSProperties}>
      {layer.kind === "photo" ? <img src={layer.value} alt="Pilot's personal passport design" /> : layer.kind === "text" ? layer.value : null}
    </span>)}
  </div>;
}

function virtualRecordCode(pilotNumber: string) {
  let seed = 5381;
  for (const character of pilotNumber) seed = (seed * 33) ^ character.charCodeAt(0);
  return `BAV-${(seed >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`;
}

function displayDate(value: string | null) {
  if (!value) return "NOT SET";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`)).toUpperCase();
}

export function VirtualPassport({ pireps, pilotName, pilotNumber, nationality, studio, dateOfBirth, profileImage }: { pireps: readonly PilotPirep[]; pilotName: string; pilotNumber: string; nationality: PassportNationality; studio: PassportStudio; dateOfBirth: string | null; profileImage: string | null }) {
  const stamps = virtualPassportStamps(pireps);
  const pages = Array.from({ length: Math.max(1, Math.ceil(stamps.length / STAMPS_PER_PAGE)) }, (_, index) => stamps.slice(index * STAMPS_PER_PAGE, (index + 1) * STAMPS_PER_PAGE));
  const theme = passportTheme(nationality);
  const [isOpen, setIsOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [turn, setTurn] = useState<PageTurn | null>(null);
  const isOriginInspired = studio.coverPreset === "origin-inspired";
  const palette = { "--passport-cover": theme.cover, "--passport-edge": theme.edge, "--passport-gold": theme.ink, "--passport-custom-cover": isOriginInspired ? theme.cover : studio.coverColor, "--passport-custom-accent": isOriginInspired ? theme.ink : studio.accentColor, "--passport-custom-texture": String(studio.texture / 100), "--passport-custom-sheen": String(studio.sheen / 100) } as CSSProperties;
  const studioClass = `passport-design-${studio.design} passport-material-${studio.material} passport-tint-${studio.tint} passport-font-${studio.font} passport-motif-${studio.motif} passport-foil-${studio.foil} passport-wear-${studio.wear}`;
  const page = pages[pageIndex];

  function turnPage(nextPage: number) {
    if (turn || nextPage < 0 || nextPage >= pages.length) return;
    const direction = nextPage > pageIndex ? "forward" : "back";
    setTurn({ direction, nextPage });
    window.setTimeout(() => setPageIndex(nextPage), 290);
  }

  if (!isOpen) return <section className={"account-v2-passport passport-real-shell " + studioClass} style={palette} aria-labelledby="passport-heading">
    <button className="passport-real-cover" type="button" onClick={() => setIsOpen(true)} aria-describedby="passport-open-help">
      <span className="passport-real-bav-ribbon">BRITISH AIRWAYS VIRTUAL</span>
      <span className="passport-real-flag" aria-hidden="true">{studio.monogram}</span>
      <span className="passport-real-cover-title" id="passport-heading">{studio.title}</span>
      <span className="passport-real-cover-subtitle">BAV TRAVEL JOURNAL</span>
      <span className="passport-real-cover-rule" aria-hidden="true" />
      <span className="passport-real-cover-caption">PERSONALISED FOR VIRTUAL FLYING</span>
      <PassportLayers studio={studio} surface="cover" />
    </button>
    <p className="passport-real-open-help" id="passport-open-help">Open your virtual passport · {stamps.length} recorded arrival{stamps.length === 1 ? "" : "s"}</p>
  </section>;

  return <section className={"account-v2-passport passport-real-shell is-open " + studioClass} style={palette} aria-labelledby="passport-heading">
    <div className="passport-real-toolbar"><div><p>BRITISH AIRWAYS VIRTUAL · {nationality.toUpperCase()}</p><h2 id="passport-heading">{studio.title}</h2></div><button type="button" onClick={() => setIsOpen(false)}>Close passport</button></div>
    <div className="passport-real-book">
      <section className={`passport-real-identity passport-real-interior-${studio.interior}`}>
        <span className="passport-real-watermark" aria-hidden="true">{theme.flag}</span>
        <p className="passport-real-page-label">BRITISH AIRWAYS VIRTUAL · PILOT TRAVEL RECORD</p>
        <div className="passport-real-photo">{profileImage ? <img src={profileImage} alt={`${pilotName}'s profile`} /> : pilotName.slice(0, 1).toUpperCase()}</div>
        <dl><div><dt>PILOT</dt><dd>{pilotName}</dd></div><div><dt>BAV PILOT ID</dt><dd>{pilotNumber}</dd></div><div><dt>VIRTUAL NATIONALITY</dt><dd>{nationality}</dd></div><div><dt>DATE OF BIRTH</dt><dd>{displayDate(dateOfBirth)}</dd></div><div><dt>BAV RECORD CODE</dt><dd>{virtualRecordCode(pilotNumber)}</dd></div></dl>
        <small>Fictional BAV member record — not valid for travel, identification or verification.</small>
        <PassportLayers studio={studio} surface="interior" />
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
