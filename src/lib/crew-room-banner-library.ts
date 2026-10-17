export type CrewRoomBanner = {
  id: string;
  name: string;
  description: string;
  image: string;
  position: string;
};

/**
 * Curated, BAV-owned artwork that a host may use without needing to upload
 * anything.  Keeping this small on purpose gives every room a recognisable
 * Lounge feel while still letting a host make it their own.
 */
export const CREW_ROOM_BANNER_LIBRARY: CrewRoomBanner[] = [
  {
    id: "lounge-evening",
    name: "Evening at the lounge",
    description: "A warm welcome before departure.",
    image: "/crew-lounge/crew-lounge-hero.webp",
    position: "center 48%",
  },
  {
    id: "flight-companion-sunset",
    name: "Sunset briefing",
    description: "A calm desk for planning the next sector.",
    image: "/flight-companion/flight-companion-hero.webp",
    position: "center center",
  },
  {
    id: "coffee-corner",
    name: "Coffee corner",
    description: "A casual place to meet new pilots.",
    image: "/crew-lounge/crew-lounge-coffee.webp",
    position: "center center",
  },
  {
    id: "airport-dusk",
    name: "Airport dusk",
    description: "A darker, more focused flight-deck mood.",
    image: "/branding/closed-beta-airport-dusk.png",
    position: "center center",
  },
];

export const DEFAULT_CREW_ROOM_BANNER_ID = CREW_ROOM_BANNER_LIBRARY[0].id;

export function crewRoomBannerById(value: string | null | undefined) {
  return CREW_ROOM_BANNER_LIBRARY.find((banner) => banner.id === value) ?? CREW_ROOM_BANNER_LIBRARY[0];
}

export function isCrewRoomBannerId(value: unknown): value is string {
  return typeof value === "string" && CREW_ROOM_BANNER_LIBRARY.some((banner) => banner.id === value);
}
