import type { PilotRank } from "@/lib/pilot-ranks";

type RankInsigniaProps = {
  rank: PilotRank;
  size?: "compact" | "default";
  showLabel?: boolean;
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
  return (
    <span className={`rank-insignia rank-insignia--${size}`} aria-label={rank} title={rank}>
      <img src={RANK_ART[rank]} alt="" aria-hidden="true" />
      {showLabel ? <span className="rank-insignia__label">{rank}</span> : null}
    </span>
  );
}
