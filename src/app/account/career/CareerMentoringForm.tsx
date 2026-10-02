"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PilotMentoringStatus } from "@/lib/pilot-store";

type Interest = "none" | "learn" | "mentor";
const levelLabel = { new: "New Mentor · 1.25×", developing: "Developing Mentor · 1.5×", experienced: "Experienced Mentor · 2×" } as const;

export function CareerMentoringForm({ initialInterest, status }: { initialInterest: Interest; status: PilotMentoringStatus }) {
  const router = useRouter();
  const [interest, setInterest] = useState<Interest>(initialInterest);
  const [applicationNote, setApplicationNote] = useState(status.application?.requestNote ?? "");
  const [message, setMessage] = useState("");
  async function save() {
    const response = await fetch("/api/pilot/career-mentoring", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ mentoringInterest: interest, mentorApplicationNote: applicationNote }) });
    const result = await response.json() as { ok?: boolean; error?: string };
    setMessage(result.ok ? (interest === "mentor" ? "Mentor application saved. Staff will review it before assigning a mentoring level." : "Mentoring preference saved.") : result.error ?? "Unable to save mentoring preference.");
    if (result.ok) router.refresh();
  }
  const match = status.match;
  const application = status.application;
  return <article className="career-card career-card-wide career-module career-module-mentoring"><div className="career-card-head"><div><span>MENTORING · OPTIONAL</span><h2>Learn together</h2></div></div>
    {match ? <ul className="career-compact-list"><li><strong>{match.role === "mentor" ? `Supporting ${match.counterpartName}` : `Mentor: ${match.counterpartName}`}</strong><span>{match.counterpartPilotNumber} · active until {new Date(match.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></li><li><strong>Shared goal</strong><span>{match.goal}</span></li>{match.role === "mentor" && match.mentorRank && match.rewardMultiplier ? <li><strong>{levelLabel[match.mentorRank]}</strong><span>{match.rewardMultiplier}× standard PIREP VA and Tier Points · {match.bonusFlightsThisMonth}/4 eligible Ember flights this month</span></li> : null}</ul> : null}
    {application && !match ? <p className="career-feedback">{application.status === "pending" ? "Your mentor application is awaiting staff review." : application.status === "approved" && application.mentorRank ? `You are approved as a ${levelLabel[application.mentorRank]}. Staff can now pair you with a learner.` : application.status === "declined" ? "Your last mentor application was not approved. You can submit a new request when you are ready." : "Your mentor application was withdrawn."}</p> : null}
    <p>{match?.role === "mentor" ? "A staff-approved match activates your assigned mentoring reward. It applies only to accepted Ember flights of at least 30 minutes, is capped at four each calendar month, and ends with the match." : "Choose the role that feels right. A mentor request is reviewed by staff; a preference alone never grants a reward."}</p>
    <div className="career-focus">{([ ["none", "Not right now"], ["learn", "I would like support"], ["mentor", "Apply to mentor new pilots"] ] as const).map(([value, label]) => <label key={value}><input type="radio" name="mentor" checked={interest === value} onChange={() => setInterest(value)} /> {label}</label>)}</div>
    {interest === "mentor" && application?.status !== "approved" ? <label className="career-textarea-label">Why would you like to mentor? <textarea value={applicationNote} onChange={(event) => setApplicationNote(event.target.value)} placeholder="Tell staff about your experience and how you would support new pilots." maxLength={1000} /></label> : null}
    <div className="career-experience-actions"><button className="career-button" type="button" onClick={save}>{interest === "mentor" && application?.status !== "approved" ? "Submit mentor application" : "Save mentoring preference"}</button>{match?.role === "mentor" ? <Link className="career-button" href="/account/career/mentoring">Open mentor flight desk →</Link> : null}{message ? <span role="status">{message}</span> : null}</div>
  </article>;
}
