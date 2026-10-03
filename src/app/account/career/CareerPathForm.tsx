"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CAREER_PATHS, CAREER_PATH_DETAILS, type CareerPath } from "@/lib/career-experience";
import styles from "./CareerPathForm.module.css";

export function CareerPathForm({ initialPath }: { initialPath: CareerPath }) {
  const router = useRouter();
  const [careerPath, setCareerPath] = useState<CareerPath>(initialPath);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  async function save() {
    setSaving(true); setFeedback(null);
    try {
      const response = await fetch("/api/pilot/career-path", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ careerPath }) });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Unable to save career path.");
      setFeedback(result.message ?? "Career path saved.");
      router.refresh();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to save career path."); } finally { setSaving(false); }
  }
  return <article className={`career-card career-card-wide career-module career-module-paths ${styles.card}`}>
    <div className="career-card-head"><div><span>CAREER PATH · OPTIONAL</span><h2>Choose a direction</h2></div></div>
    <p>Your path is a personal lens for progress, not a restriction. It never changes flight access, rank, qualifications, finance or earned points.</p>
    <fieldset disabled={saving}><legend>What would you like to build toward?</legend><div className={styles.options}>{CAREER_PATHS.map((path) => { const detail = CAREER_PATH_DETAILS[path]; return <label key={path} className={careerPath === path ? styles.selected : ""}><input type="radio" name="career-path" checked={careerPath === path} onChange={() => setCareerPath(path)} /><strong>{detail.label}</strong><small>{detail.description}</small></label>; })}</div></fieldset>
    <div className={styles.actions}><button className="career-button" type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save career path"}</button>{feedback ? <span role="status">{feedback}</span> : null}</div>
  </article>;
}
