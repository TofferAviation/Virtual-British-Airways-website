import { useId } from "react";
import type { PilotRank } from "@/lib/pilot-ranks";

type RankInsigniaProps = {
  rank: PilotRank;
  size?: "compact" | "default";
  showLabel?: boolean;
};

const RANK_DETAILS: Record<PilotRank, { stripes: number; distinction?: "senior" | "training"; speedmarque?: boolean }> = {
  Cadet: { stripes: 0 },
  "Second Officer": { stripes: 1 },
  "First Officer": { stripes: 2, speedmarque: true },
  "Senior First Officer": { stripes: 3 },
  Captain: { stripes: 4 },
  "Senior Captain": { stripes: 4, distinction: "senior" },
  "Training Captain": { stripes: 4, distinction: "training" },
};

const RANK_ART: Record<PilotRank, string> = {
  Cadet: "/branding/pilot-ranks/cadet.png",
  "Second Officer": "/branding/pilot-ranks/SO.png",
  "First Officer": "/branding/pilot-ranks/FO.png",
  "Senior First Officer": "/branding/pilot-ranks/SFO.png",
  Captain: "/branding/pilot-ranks/C.png",
  "Senior Captain": "/branding/pilot-ranks/SC.png",
  "Training Captain": "/branding/pilot-ranks/TC.png",
};

/** Shoulder-board rank insignia based on the BAV flight-deck rank concept. */
export function RankInsignia({ rank, size = "default", showLabel = false }: RankInsigniaProps) {
  const detail = RANK_DETAILS[rank];
  const gradientPrefix = useId().replace(/:/g, "");
  const boardGradient = `${gradientPrefix}-board`;
  const goldGradient = `${gradientPrefix}-gold`;

  return (
    <span className={`rank-insignia rank-insignia--${size}`} aria-label={rank} title={rank}>
      <img src={RANK_ART[rank]} alt="" aria-hidden="true" />
      <svg viewBox="0 0 72 108" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={boardGradient} x1="0" x2="1" y1="0" y2="1"><stop stopColor="#173a63" /><stop offset=".48" stopColor="#071b35" /><stop offset="1" stopColor="#102a4a" /></linearGradient>
          <linearGradient id={goldGradient} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#fff0a7" /><stop offset=".24" stopColor="#e5b94b" /><stop offset=".58" stopColor="#9d6819" /><stop offset="1" stopColor="#f4d16a" /></linearGradient>
        </defs>
        <path className="rank-insignia__board-shadow" d="M17 103V31L36 8l19 23v72z" />
        <path className="rank-insignia__board" d="M15 100V30L36 6l21 24v70z" fill={`url(#${boardGradient})`} />
        <path className="rank-insignia__stitch" d="M19 98V32L36 12l17 20v66" />
        <circle className="rank-insignia__button" cx="36" cy="22" r="7.1" fill={`url(#${goldGradient})`} />
        <path className="rank-insignia__button-mark" d="M31.7 22c2.8-1.8 6-2.1 9.1-.2-2.8-.5-5.4.3-7.8 2.3 1.8-2.4 4.2-3.7 7.4-4-3.1-.7-5.9-.1-8.7 1.9z" />
        {detail.distinction === "senior" ? <g className="rank-insignia__senior-mark" fill={`url(#${goldGradient})`}><path d="M25 57c-4-2-6.5-6-6.7-10.3 2.4 2.3 4.7 3.3 6.9 3.1-2.6-2.6-3.8-5.3-3.6-8.3 3.1 2.8 5.6 4 7.5 3.6-1.8-3-2.1-5.7-.9-8.2 2.4 3.9 5.1 6.3 7.9 7.2-4.2 2.7-7.9 7-11 13z" /><path d="M47 57c4-2 6.5-6 6.7-10.3-2.4 2.3-4.7 3.3-6.9 3.1 2.6-2.6 3.8-5.3 3.6-8.3-3.1 2.8-5.6 4-7.5 3.6 1.8-3 2.1-5.7.9-8.2-2.4 3.9-5.1 6.3-7.9 7.2 4.2 2.7 7.9 7 11 13z" /></g> : null}
        {detail.distinction === "training" ? <g className="rank-insignia__training-mark" fill={`url(#${goldGradient})`}><path d="m36 39 3.3 7.1 7.7.8-5.7 5 1.6 7.6-6.9-3.9-6.9 3.9 1.6-7.6-5.7-5 7.7-.8z" /><path d="M17 47 30 51v4l-13 2-8-5zm38 0L42 51v4l13 2 8-5z" /></g> : null}
        {detail.speedmarque ? <g className="rank-insignia__speedmarque"><path d="M27 57c7.5-3.6 14-3.2 19.3 1.2-6.2-1.3-11.5.3-16.2 4.9 1.9-2.7 5.2-5.1 9.6-6.6-4.5.2-8.7.3-12.7.5z" /><path d="M41.6 58.2c2.6-.2 4.9.7 6.7 2.6-2.5-.3-4.7.2-6.7 1.5z" /></g> : null}
        {Array.from({ length: detail.stripes }, (_, index) => <rect className="rank-insignia__stripe" fill={`url(#${goldGradient})`} height="6.3" key={index} rx="1.1" width="38" x="17" y={88 - index * 10.1} />)}
      </svg>
      {showLabel ? <span className="rank-insignia__label">{rank}</span> : null}
    </span>
  );
}
