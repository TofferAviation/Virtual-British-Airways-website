"use client";

import { useState } from "react";
import type { MentoringMatch, PublicPilotAccount } from "@/lib/pilot-store";

type Pilot = Pick<PublicPilotAccount, "id" | "name" | "pilotNumber" | "email">;

async function change(body: Record<string, unknown>) {
  const response = await fetch("/api/staff/mentoring", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as { ok?: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error ?? "Unable to update mentoring.");
}

export function MentoringCentre({ mentors, learners, matches, pilots }: { mentors: Pilot[]; learners: Pilot[]; matches: MentoringMatch[]; pilots: Pilot[] }) {
  const [mentorPilotId, setMentorPilotId] = useState(mentors[0]?.id ?? "");
  const [learnerPilotId, setLearnerPilotId] = useState(learners[0]?.id ?? "");
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pilot = (id: string) => pilots.find((item) => item.id === id);
  async function run(body: Record<string, unknown>) { setBusy(true); setMessage(""); try { await change(body); window.location.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update mentoring."); setBusy(false); } }
  return <section className="career-grid"><article className="career-card career-card-wide"><div className="career-card-head"><div><span>STAFF-CONTROLLED MATCHING</span><h2>Create mentoring match</h2></div></div><p>Only staff can create a match. Each match lasts 30 days; a mentor can have three active pilots and earns the 1.25× reward on at most four eligible accepted Ember flights per calendar month.</p><div className="staff-training-form"><select value={mentorPilotId} onChange={(event) => setMentorPilotId(event.target.value)}><option value="">Choose mentor</option>{mentors.map((pilot) => <option key={pilot.id} value={pilot.id}>{pilot.name} · {pilot.pilotNumber}</option>)}</select><select value={learnerPilotId} onChange={(event) => setLearnerPilotId(event.target.value)}><option value="">Choose learner</option>{learners.map((pilot) => <option key={pilot.id} value={pilot.id}>{pilot.name} · {pilot.pilotNumber}</option>)}</select><input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Shared goal, e.g. first long-haul briefing" maxLength={500} /><button className="career-button" disabled={busy || !mentorPilotId || !learnerPilotId} onClick={() => run({ action: "create", mentorPilotId, learnerPilotId, goal })}>Create match</button></div>{message ? <p className="career-feedback error" role="alert">{message}</p> : null}{!mentors.length || !learners.length ? <p className="career-feedback">A match needs one pilot who volunteered as a mentor and one who requested support.</p> : null}</article>
    <article className="career-card career-card-wide"><div className="career-card-head"><div><span>MENTORING RECORDS</span><h2>Active &amp; completed matches</h2></div></div>{matches.length ? <div className="staff-module-list">{matches.map((match) => { const mentor = pilot(match.mentorPilotId); const learner = pilot(match.learnerPilotId); const active = match.status === "active" && Date.parse(match.expiresAt) > Date.now(); return <div key={match.id}><strong>{mentor?.name ?? "Unknown mentor"} → {learner?.name ?? "Unknown learner"}</strong><small>{match.status} · goal: {match.goal} · expires {new Date(match.expiresAt).toLocaleDateString("en-GB")}</small>{match.progressNotes.map((note) => <small key={note.id}>{new Date(note.createdAt).toLocaleDateString("en-GB")} · {note.authorName}: {note.note}</small>)}{active ? <form onSubmit={(event) => { event.preventDefault(); run({ action: "progress", matchId: match.id, note: notes[match.id] ?? "" }); }}><input value={notes[match.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [match.id]: event.target.value }))} placeholder="Record a check-in or progress update" maxLength={1000} /><button disabled={busy}>Add check-in</button><button type="button" disabled={busy} onClick={() => run({ action: "end", matchId: match.id, status: "completed" })}>Complete</button><button type="button" disabled={busy} onClick={() => run({ action: "end", matchId: match.id, status: "cancelled" })}>End</button></form> : null}</div>; })}</div> : <p>No mentoring matches yet.</p>}</article></section>;
}
