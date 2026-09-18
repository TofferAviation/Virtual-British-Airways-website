import type { PilotRank } from "@/lib/pilot-ranks";

type RankInsigniaProps = {
  rank: PilotRank;
  size?: "compact" | "default";
  showLabel?: boolean;
};

const RANK_DETAILS: Record<PilotRank, { stripes: number; distinction?: "senior" | "training" }> = {
  Cadet: { stripes: 0 },
  "Second Officer": { stripes: 1 },
  "First Officer": { stripes: 2 },
  "Senior First Officer": { stripes: 3 },
  Captain: { stripes: 4 },
  "Senior Captain": { stripes: 4, distinction: "senior" },
  "Training Captain": { stripes: 4, distinction: "training" },
};

/** A small, original flight-deck-style badge used to identify BAV pilot rank. */
export function RankInsignia({ rank, size = "default", showLabel = false }: RankInsigniaProps) {
  const detail = RANK_DETAILS[rank];

  return (
    <span className={`rank-insignia rank-insignia--${size}`} aria-label={rank} title={rank}>
      <svg viewBox="0 0 72 36" aria-hidden="true" focusable="false">
        <path className="rank-insignia__wing" d="M3 18 17 9l14 6v6L17 27z" />
        <path className="rank-insignia__wing" d="m69 18-14-9-14 6v6l14 6z" />
        <path className="rank-insignia__plate" d="M25 7h22v22H25z" rx="2" />
        {detail.stripes ? Array.from({ length: detail.stripes }, (_, index) => (
          <rect className="rank-insignia__stripe" height="2.6" key={index} rx="1.3" width="18" x="27" y={26 - index * 4.7} />
        )) : <path className="rank-insignia__chevron" d="m28 14 8 8 8-8" />}
        {detail.distinction === "senior" ? <path className="rank-insignia__distinction" d="m36 7 3 3-3 3-3-3z" /> : null}
        {detail.distinction === "training" ? <path className="rank-insignia__distinction" d="m36 5.8 1.4 3.1 3.4.3-2.6 2.2.8 3.3-3-1.7-3 1.7.8-3.3-2.6-2.2 3.4-.3z" /> : null}
      </svg>
      {showLabel ? <span className="rank-insignia__label">{rank}</span> : null}
    </span>
  );
}
