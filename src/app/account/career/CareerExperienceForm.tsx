"use client";

import { useState } from "react";
import type { CareerExperienceMode, CareerExperiencePreferences, CareerFocus } from "@/lib/career-experience";
import styles from "./CareerExperienceForm.module.css";

const MODES: Array<{ value: CareerExperienceMode; label: string; detail: string }> = [
  { value: "fly", label: "Fly", detail: "Choose any flight and keep your career history simple." },
  { value: "career", label: "Career", detail: "Follow optional goals, ranks and learning opportunities." },
  { value: "realistic_operations", label: "Realistic operations", detail: "Prepare for future currency, assignment and roster tools." },
];
const FOCUS: Array<{ value: CareerFocus; label: string }> = [
  { value: "explore", label: "Explore the network" },
  { value: "progression", label: "Build my progression" },
  { value: "operations", label: "Fly realistic operations" },
];

export function CareerExperienceForm({ initialPreferences }: { initialPreferences: CareerExperiencePreferences }) {
  const [mode, setMode] = useState<CareerExperienceMode>(initialPreferences.mode);
  const [focus, setFocus] = useState<CareerFocus>(initialPreferences.focus);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true); setFeedback(null);
    try {
      const response = await fetch("/api/pilot/career-experience", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, focus }) });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Unable to save career preferences.");
      setFeedback(result.message ?? "Career preferences saved.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to save career preferences."); } finally { setSaving(false); }
  }
  return <article className={`career-card career-card-wide ${styles.experience}`}>
    <div className="career-card-head"><div><span>YOUR EXPERIENCE</span><h2>Choose your career depth</h2></div></div>
    <p>You can change this at any time. It never changes completed flights, rank, qualifications, finance or operational permissions.</p>
    <fieldset disabled={saving}><legend>How would you like to fly?</legend><div className={styles.options}>{MODES.map((item) => <label key={item.value} className={mode === item.value ? styles.selected : ""}><input type="radio" name="career-mode" value={item.value} checked={mode === item.value} onChange={() => setMode(item.value)} /><strong>{item.label}</strong><small>{item.detail}</small></label>)}</div></fieldset>
    <fieldset disabled={saving} className={styles.focus}><legend>What interests you most right now?</legend><div>{FOCUS.map((item) => <label key={item.value}><input type="radio" name="career-focus" value={item.value} checked={focus === item.value} onChange={() => setFocus(item.value)} /> {item.label}</label>)}</div></fieldset>
    <div className={styles.actions}><button className="career-button" type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save career preferences"}</button>{feedback ? <span role="status">{feedback}</span> : null}</div>
  </article>;
}
