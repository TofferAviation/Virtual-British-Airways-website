"use client";

import { useState, type CSSProperties } from "react";
import type { PilotPirep } from "@/lib/pilot-operations-store";
import { passportTheme, type PassportNationality } from "@/lib/passport-nationalities";
import type { PassportStudio } from "@/lib/passport-studio";
import { virtualPassportStamps, type VirtualPassportStamp } from "@/lib/virtual-passport";

const STAMPS_PER_SPREAD = 8;
type PageTurn = { direction: "forward" | "back"; nextPage: number };

function PassportLayers({ studio }: { studio: PassportStudio }) {
  return <span className="passport-real-custom-layers" aria-label="Personal passport cover design">
    {studio.layers.filter((layer) => layer.surface === "cover").map((layer) => <span key={layer.id} className={`passport-real-custom-layer passport-real-custom-layer-${layer.kind}`} style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, height: `${layer.height}%`, color: layer.color, borderColor: layer.outline, borderWidth: layer.outlineWidth } as CSSProperties}>
      {layer.kind === "photo" ? <img src={layer.value} alt="Pilot's personal passport design" /> : layer.kind === "text" ? layer.value : null}
    </span>)}
  </span>;
}

function DirectStamp({ stamp, position }: { stamp: VirtualPassportStamp; position: number }) {
  return <article className={`passport-real-direct-stamp stamp-position-${position % 4}`} style={{ "--passport-ink": stamp.ink, "--passport-rotation": `${stamp.rotation}deg` } as CSSProperties}>
    <div className="passport-real-direct-stamp-copy"><span>{stamp.flightNumber}</span><strong>{stamp.airportCode}</strong><p>{stamp.airportName}</p><small>{stamp.country}</small></div>
    <div className="passport-real-direct-seal" aria-label={`Arrived ${stamp.completedDate} at ${stamp.completedTime}`}><span>ARRIVED</span><b>{stamp.completedDate}</b><em>{stamp.completedTime}</em><i>BAV</i></div>
  </article>;
}

function StampPage({ stamps, pageNumber, side }: { stamps: VirtualPassportStamp[]; pageNumber: number; side: "left" | "right" }) {
  return <section className={`passport-real-stamp-page passport-real-stamp-page-${side}`}>
    <header><span>BAV ARRIVAL STAMPS</span><b>PAGE {pageNumber}</b></header>
    {stamps.length ? <div className="passport-real-direct-stamps">{stamps.map((stamp, index) => <DirectStamp key={stamp.id} stamp={stamp} position={index} />)}</div> : <div className="passport-real-blank-page"><span>✦</span><p>Future BAV arrivals will be recorded here.</p></div>}
  </section>;
}

function virtualRecordCode(pilotNumber: string) {
  let seed = 5381;
  for (const character of pilotNumber) seed = (seed * 33) ^ character.charCodeAt(0);
  return `BAV-${(seed >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`;
}

function displayDate(value: string | null) {
  if (!value) return "SET IN ACCOUNT";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`)).toUpperCase();
}

function PilotRecordSpread({ pilotName, pilotNumber, nationality, dateOfBirth, profileImage }: { pilotName: string; pilotNumber: string; nationality: PassportNationality; dateOfBirth: string | null; profileImage: string | null }) {
  return <>
    <section className="passport-real-member-page passport-real-member-page-title"><span className="passport-real-member-kicker">BRITISH AIRWAYS VIRTUAL</span><div className="passport-real-member-mark" aria-hidden="true">✦</div><h3>BAV PILOT<br />TRAVEL JOURNAL</h3><i /><p>ISSUED FOR VIRTUAL FLYING</p><small>THIS BOOK BELONGS TO</small><strong>{pilotName}</strong><em>Member record · Page 1</em></section>
    <span className="passport-real-spine" aria-hidden="true" />
    <section className="passport-real-member-page passport-real-member-page-record"><header><span>BAV PILOT RECORD</span><b>PAGE 2</b></header><div className="passport-real-member-layout"><div className="passport-real-member-photo">{profileImage ? <img src={profileImage} alt={`${pilotName}'s profile`} /> : <span>{pilotName.slice(0, 1).toUpperCase()}</span>}</div><dl><div><dt>PILOT</dt><dd>{pilotName}</dd></div><div><dt>BAV PILOT ID</dt><dd>{pilotNumber}</dd></div><div><dt>VIRTUAL NATIONALITY</dt><dd>{nationality}</dd></div><div><dt>DATE OF BIRTH</dt><dd>{displayDate(dateOfBirth)}</dd></div><div><dt>BAV RECORD CODE</dt><dd>{virtualRecordCode(pilotNumber)}</dd></div></dl></div><footer>Fictional BAV member record · Never valid for travel, identification or verification.</footer></section>
  </>;
}

export function VirtualPassport({ pireps, pilotName, pilotNumber, nationality, studio, dateOfBirth, profileImage }: { pireps: readonly PilotPirep[]; pilotName: string; pilotNumber: string; nationality: PassportNationality; studio: PassportStudio; dateOfBirth: string | null; profileImage: string | null }) {
  const stamps = virtualPassportStamps(pireps);
  const spreads = Array.from({ length: Math.max(1, Math.ceil(stamps.length / STAMPS_PER_SPREAD)) }, (_, index) => stamps.slice(index * STAMPS_PER_SPREAD, (index + 1) * STAMPS_PER_SPREAD));
  const theme = passportTheme(nationality);
  const [isOpen, setIsOpen] = useState(false);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [turn, setTurn] = useState<PageTurn | null>(null);
  const isOriginInspired = studio.coverPreset === "origin-inspired";
  const palette = { "--passport-cover": theme.cover, "--passport-edge": theme.edge, "--passport-gold": theme.ink, "--passport-custom-cover": isOriginInspired ? theme.cover : studio.coverColor, "--passport-custom-accent": isOriginInspired ? theme.ink : studio.accentColor, "--passport-custom-texture": String(studio.texture / 100), "--passport-custom-sheen": String(studio.sheen / 100) } as CSSProperties;
  const studioClass = `passport-design-${studio.design} passport-material-${studio.material} passport-tint-${studio.tint} passport-font-${studio.font} passport-motif-${studio.motif} passport-foil-${studio.foil} passport-wear-${studio.wear}`;
  const isMemberSpread = spreadIndex === 0;
  const currentSpread = spreads[Math.max(0, spreadIndex - 1)];
  const leftStamps = currentSpread.slice(0, 4);
  const rightStamps = currentSpread.slice(4, 8);

  function turnPage(nextPage: number) {
    if (turn || nextPage < 0 || nextPage > spreads.length) return;
    setTurn({ direction: nextPage > spreadIndex ? "forward" : "back", nextPage });
    window.setTimeout(() => setSpreadIndex(nextPage), 290);
  }

  if (!isOpen) return <section className={`account-v2-passport passport-real-shell ${studioClass}`} style={palette} aria-labelledby="passport-heading">
    <button className="passport-real-cover" type="button" onClick={() => setIsOpen(true)} aria-describedby="passport-open-help">
      <span className="passport-real-bav-ribbon">BRITISH AIRWAYS VIRTUAL</span>
      <span className="passport-real-flag" aria-hidden="true">{studio.monogram}</span>
      <span className="passport-real-cover-title" id="passport-heading">{studio.title}</span>
      <span className="passport-real-cover-subtitle">BAV TRAVEL JOURNAL</span>
      <span className="passport-real-cover-rule" aria-hidden="true" />
      <span className="passport-real-cover-caption">PERSONALISED FOR VIRTUAL FLYING</span>
      <PassportLayers studio={studio} />
    </button>
    <p className="passport-real-open-help" id="passport-open-help">Open your virtual passport · {stamps.length} recorded arrival{stamps.length === 1 ? "" : "s"}</p>
  </section>;

  return <section className={`account-v2-passport passport-real-shell is-open ${studioClass}`} style={palette} aria-labelledby="passport-heading">
    <div className="passport-real-toolbar"><div><p>BRITISH AIRWAYS VIRTUAL · {nationality.toUpperCase()}</p><h2 id="passport-heading">{studio.title}</h2></div><button type="button" onClick={() => setIsOpen(false)}>Close passport</button></div>
    <div className="passport-real-book passport-real-stamp-book" aria-live="polite" aria-atomic="true">
      <div className="passport-real-stamp-spread">
        {isMemberSpread ? <PilotRecordSpread pilotName={pilotName} pilotNumber={pilotNumber} nationality={nationality} dateOfBirth={dateOfBirth} profileImage={profileImage} /> : <><StampPage stamps={leftStamps} pageNumber={spreadIndex * 2 + 1} side="left" /><span className="passport-real-spine" aria-hidden="true" /><StampPage stamps={rightStamps} pageNumber={spreadIndex * 2 + 2} side="right" /></>}
        <div className="passport-real-controls"><button type="button" onClick={() => turnPage(spreadIndex - 1)} disabled={spreadIndex === 0 || Boolean(turn)}>← Previous</button><span>{isMemberSpread ? "Open arrival stamps" : `Turn page · ${spreadIndex + 1} / ${spreads.length + 1}`}</span><button type="button" onClick={() => turnPage(spreadIndex + 1)} disabled={spreadIndex === spreads.length || Boolean(turn)}>{isMemberSpread ? "Arrival stamps →" : "Next →"}</button></div>
        {turn ? <span className={`passport-real-turning-sheet is-turning-${turn.direction}`} onAnimationEnd={() => setTurn(null)} aria-hidden="true" /> : null}
      </div>
    </div>
    <p className="account-v2-passport-note">Virtual airline keepsake only — not an official travel or immigration document.</p>
  </section>;
}
