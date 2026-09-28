import Link from "next/link";
import type { CareerExperiencePreferences } from "@/lib/career-experience";

const COPY = {
  fly: { title: "Fly freely", text: "Your flights, rank, finances and qualifications continue as normal. Career recommendations stay out of the way until you choose a deeper experience.", action: "Find a flight →", href: "/book" },
  career: { title: "Build your progression", text: "Career Dispatcher and performance guidance use the live BAV schedule and your accepted flight history to suggest optional next steps.", action: "Explore qualifications →", href: "/account/qualifications" },
  realistic_operations: { title: "Operate with more context", text: "The test bed adds operational readiness and performance guidance around your existing booking, SimBrief and Ember workflow. It never blocks a flight or changes BAV operational rules.", action: "Open flight desk →", href: "/manage-assignment" },
} as const;

export function CareerModeGuide({ preferences }: { preferences: CareerExperiencePreferences }) {
  const detail = COPY[preferences.mode];
  return <article className="career-card career-card-wide career-module career-module-guide"><div className="career-card-head"><div><span>ACTIVE CAREER EXPERIENCE</span><h2>{detail.title}</h2></div><Link href={detail.href}>{detail.action}</Link></div><p>{detail.text}</p></article>;
}
