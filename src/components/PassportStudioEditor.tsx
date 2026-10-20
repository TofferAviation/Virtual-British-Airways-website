"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { DEFAULT_PASSPORT_STUDIO, PASSPORT_STUDIO_DESIGNS, PASSPORT_STUDIO_FOILS, PASSPORT_STUDIO_FONTS, PASSPORT_STUDIO_MATERIALS, PASSPORT_STUDIO_MOTIFS, PASSPORT_STUDIO_WEARS, type PassportStudio } from "@/lib/passport-studio";

const COLOUR_LIBRARY = [
  { name: "Midnight", cover: "#102C5F", accent: "#E5BF60" },
  { name: "Oxblood", cover: "#6B1F36", accent: "#EDC77C" },
  { name: "Emerald", cover: "#175C4B", accent: "#EAD085" },
  { name: "Sapphire", cover: "#194F92", accent: "#DBE9FF" },
  { name: "Silver mist", cover: "#76818D", accent: "#F4F0DF" },
] as const;

const SURFACE_LIBRARY = [
  { name: "Quiet", texture: 18, sheen: 14, note: "restrained" },
  { name: "Tactile", texture: 48, sheen: 35, note: "balanced" },
  { name: "Lacquered", texture: 28, sheen: 82, note: "high sheen" },
  { name: "Rugged", texture: 83, sheen: 18, note: "field worn" },
] as const;

async function saveStudio(passportStudio: PassportStudio) {
  const response = await fetch("/api/pilot/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ passportStudio }) });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.error || "Unable to save Passport Studio.");
}

export function PassportStudioEditor({ initialStudio, pilotName }: { initialStudio: PassportStudio; pilotName: string }) {
  const [studio, setStudio] = useState(initialStudio);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const previewStyle = { "--studio-editor-cover": studio.coverColor, "--studio-editor-accent": studio.accentColor, "--studio-editor-texture": String(studio.texture / 100), "--studio-editor-sheen": String(studio.sheen / 100) } as CSSProperties;
  const previewClass = `passport-studio-canvas passport-material-${studio.material} passport-design-${studio.design} passport-font-${studio.font} passport-motif-${studio.motif} passport-foil-${studio.foil} passport-wear-${studio.wear}`;

  function update<K extends keyof PassportStudio>(key: K, value: PassportStudio[K]) {
    setStudio((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await saveStudio(studio);
      setMessage("Saved. Your Virtual Passport now uses this cover.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save Passport Studio.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="passport-studio-page">
    <header className="passport-studio-topbar"><Link href="/account/profile">← Account settings</Link><span>PASSPORT STUDIO</span><Link href="/account/passport">View passport ↗</Link></header>
    <section className="passport-studio-hero"><div><span>PERSONAL BAV TRAVEL JOURNAL</span><h1>Build a cover that feels like yours.</h1><p>{pilotName}, select from the material library, combine finishes and make changes directly on the live cover.</p></div><button type="button" onClick={() => setStudio(DEFAULT_PASSPORT_STUDIO)}>Reset to studio default</button></section>
    <div className="passport-studio-layout">
      <aside className="passport-studio-library" aria-label="Passport material library">
        <div className="passport-studio-panel-heading"><span>01</span><div><strong>Material library</strong><small>Apply a physical base</small></div></div>
        <div className="passport-studio-tile-grid">{PASSPORT_STUDIO_MATERIALS.map((item) => <button key={item.value} type="button" className={`passport-studio-library-tile material-${item.value}${studio.material === item.value ? " selected" : ""}`} onClick={() => update("material", item.value)} aria-pressed={studio.material === item.value}><i /><strong>{item.label}</strong></button>)}</div>
        <div className="passport-studio-panel-heading"><span>02</span><div><strong>Colour library</strong><small>Start with a palette</small></div></div>
        <div className="passport-studio-colour-library">{COLOUR_LIBRARY.map((colour) => <button key={colour.name} type="button" className={studio.coverColor === colour.cover ? "selected" : ""} style={{ "--cover": colour.cover, "--accent": colour.accent } as CSSProperties} onClick={() => setStudio((current) => ({ ...current, coverColor: colour.cover, accentColor: colour.accent }))}><i /><span>{colour.name}</span></button>)}</div>
      </aside>
      <section className="passport-studio-stage" aria-label="Live cover preview">
        <div className="passport-studio-stage-head"><span>LIVE REVIEW</span><small>Changes are not saved until you apply them.</small></div>
        <div className={previewClass} style={previewStyle}><span className="passport-studio-canvas-monogram">{studio.monogram || "BAV"}</span><strong>{studio.title || "BAV FLIGHT PASSPORT"}</strong><span>BAV TRAVEL JOURNAL</span><i /><small>PERSONALISED FOR VIRTUAL FLYING</small></div>
        <div className="passport-studio-name-controls"><label>Cover title<input value={studio.title} maxLength={32} onChange={(event) => update("title", event.target.value)} /></label><label>Monogram<input value={studio.monogram} maxLength={5} onChange={(event) => update("monogram", event.target.value.toUpperCase())} /></label></div>
      </section>
      <aside className="passport-studio-library passport-studio-finishing" aria-label="Passport finishing tools">
        <div className="passport-studio-panel-heading"><span>03</span><div><strong>Cover language</strong><small>Typography and motif</small></div></div>
        <div className="passport-studio-choice-list"><div><span>Typeface</span>{PASSPORT_STUDIO_FONTS.map((item) => <button key={item.value} type="button" className={studio.font === item.value ? "selected" : ""} onClick={() => update("font", item.value)}>{item.label}</button>)}</div><div><span>Motif</span>{PASSPORT_STUDIO_MOTIFS.map((item) => <button key={item.value} type="button" className={studio.motif === item.value ? "selected" : ""} onClick={() => update("motif", item.value)}>{item.label}</button>)}</div></div>
        <div className="passport-studio-panel-heading"><span>04</span><div><strong>Finishing bench</strong><small>Foil, surface and wear</small></div></div>
        <div className="passport-studio-choice-list"><div><span>Foil</span>{PASSPORT_STUDIO_FOILS.map((item) => <button key={item.value} type="button" className={studio.foil === item.value ? "selected" : ""} onClick={() => update("foil", item.value)}>{item.label}</button>)}</div><div><span>Wear</span>{PASSPORT_STUDIO_WEARS.map((item) => <button key={item.value} type="button" className={studio.wear === item.value ? "selected" : ""} onClick={() => update("wear", item.value)}>{item.label}</button>)}</div></div>
      </aside>
    </div>
    <section className="passport-studio-bottom"><div><span>05 · SURFACE PRESETS</span><div className="passport-studio-surface-library">{SURFACE_LIBRARY.map((surface) => <button key={surface.name} type="button" className={studio.texture === surface.texture && studio.sheen === surface.sheen ? "selected" : ""} onClick={() => setStudio((current) => ({ ...current, texture: surface.texture, sheen: surface.sheen }))}><strong>{surface.name}</strong><small>{surface.note}</small></button>)}</div></div><div className="passport-studio-custom-colours"><label>Custom cover colour<input type="color" value={studio.coverColor} onChange={(event) => update("coverColor", event.target.value.toUpperCase())} /><input value={studio.coverColor} maxLength={7} onChange={(event) => update("coverColor", event.target.value.toUpperCase())} /></label><label>Custom accent<input type="color" value={studio.accentColor} onChange={(event) => update("accentColor", event.target.value.toUpperCase())} /><input value={studio.accentColor} maxLength={7} onChange={(event) => update("accentColor", event.target.value.toUpperCase())} /></label></div><div className="passport-studio-save"><button type="button" onClick={save} disabled={saving}>{saving ? "Applying cover…" : "Apply to my passport"}</button>{message ? <p role="status">{message}</p> : null}</div></section>
  </main>;
}
