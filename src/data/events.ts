export type EventCategoryId = "community" | "long-haul" | "challenge";

export type VirtualEvent = {
  id: string;
  slug: string;
  title: string;
  typeLabel: string;
  category: EventCategoryId;
  summary: string;
  description: string;
  date: string;
  startUtc: string;
  endUtc: string;
  route: {
    from: string;
    to: string;
    fromName: string;
    toName: string;
  };
  image: string;
  imagePosition?: string;
  featured?: boolean;
  published: boolean;
  registrationOpen: boolean;
  participantCount: number;
  featuredDestinations: string[];
  aircraftNote: string;
  rewards: {
    vaPoints: number;
    tierPoints: number;
    badge?: string;
  };
};

export type EventCategory = {
  id: EventCategoryId;
  title: string;
  description: string;
  linkLabel: string;
  icon: "plane" | "globe" | "star";
  image: string;
};

export const eventCategories: EventCategory[] = [
  {
    id: "community",
    title: "Community Flights",
    description: "Join regular events that bring our community together, from shuttle flights to regional routes.",
    linkLabel: "View community events",
    icon: "plane",
    image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=84",
  },
  {
    id: "long-haul",
    title: "Long-haul Weekends",
    description: "Take on iconic routes and explore destinations around the world with fellow pilots.",
    linkLabel: "View long-haul events",
    icon: "globe",
    image: "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=900&q=84",
  },
  {
    id: "challenge",
    title: "Special Challenges",
    description: "Take part in unique themed events, anniversaries and real-world celebrations for extra rewards.",
    linkLabel: "View special events",
    icon: "star",
    image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=84",
  },
];

export const virtualEvents: VirtualEvent[] = [
  {
    id: "evt-heathrow-shuttle-2026-09",
    slug: "heathrow-shuttle-night",
    title: "Heathrow Shuttle Night",
    typeLabel: "Community Flight",
    category: "community",
    summary: "A classic route. A global community.",
    description: "Keep the London skies busy in this popular community event. Fly between Heathrow and Gatwick and help connect the UK alongside other British Airways Virtual pilots.",
    date: "2026-09-12",
    startUtc: "17:00",
    endUtc: "22:00",
    route: {
      from: "EGLL",
      to: "EGKK",
      fromName: "Heathrow",
      toName: "Gatwick",
    },
    image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1800&q=88",
    imagePosition: "center 52%",
    featured: true,
    published: true,
    registrationOpen: true,
    participantCount: 312,
    featuredDestinations: ["LHR", "LGW"],
    aircraftNote: "All aircraft welcome",
    rewards: {
      vaPoints: 100,
      tierPoints: 10,
      badge: "Heathrow Shuttle Night",
    },
  },
  {
    id: "evt-european-city-hopper-2026-09",
    slug: "european-city-hopper",
    title: "European City Hopper",
    typeLabel: "Regional Event",
    category: "community",
    summary: "Multiple European cities in one evening.",
    description: "Choose from a rotating list of short-haul sectors and build a multi-leg evening across the European network with the wider community.",
    date: "2026-09-17",
    startUtc: "18:00",
    endUtc: "22:00",
    route: {
      from: "EGLL",
      to: "LOWW",
      fromName: "London Heathrow",
      toName: "Vienna",
    },
    image: "https://images.unsplash.com/photo-1519671282429-b44660ead0a7?auto=format&fit=crop&w=1400&q=86",
    imagePosition: "center 48%",
    published: true,
    registrationOpen: true,
    participantCount: 244,
    featuredDestinations: ["LHR", "AMS", "BRU", "CDG", "FRA", "MUC", "VIE", "PRG", "MAD", "BCN", "FCO", "ZRH"],
    aircraftNote: "Short-haul fleet recommended",
    rewards: {
      vaPoints: 100,
      tierPoints: 10,
      badge: "European City Hopper",
    },
  },
  {
    id: "evt-long-haul-friday-2026-09",
    slug: "long-haul-friday",
    title: "Long-Haul Friday",
    typeLabel: "Long-haul Event",
    category: "long-haul",
    summary: "End the week with a transatlantic departure.",
    description: "Join a coordinated evening departure from Heathrow to New York and enjoy a full long-haul operation with the British Airways Virtual community.",
    date: "2026-09-23",
    startUtc: "17:00",
    endUtc: "23:59",
    route: {
      from: "EGLL",
      to: "KJFK",
      fromName: "London Heathrow",
      toName: "New York JFK",
    },
    image: "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=1400&q=86",
    imagePosition: "center 45%",
    published: true,
    registrationOpen: true,
    participantCount: 205,
    featuredDestinations: ["LHR", "JFK"],
    aircraftNote: "Long-haul fleet recommended",
    rewards: {
      vaPoints: 150,
      tierPoints: 15,
      badge: "Long-Haul Friday",
    },
  },
  {
    id: "evt-british-isles-relay-2026-09",
    slug: "british-isles-relay",
    title: "British Isles Relay",
    typeLabel: "Community Flight",
    category: "community",
    summary: "A fast-moving relay around the home network.",
    description: "Fly one or more sectors across the UK and Ireland as the community moves between regional stations throughout the evening.",
    date: "2026-09-26",
    startUtc: "15:00",
    endUtc: "21:00",
    route: {
      from: "EGLL",
      to: "EGPH",
      fromName: "London Heathrow",
      toName: "Edinburgh",
    },
    image: "https://images.unsplash.com/photo-1506377585622-bedcbb5a8b2c?auto=format&fit=crop&w=1400&q=86",
    imagePosition: "center 50%",
    published: true,
    registrationOpen: true,
    participantCount: 182,
    featuredDestinations: ["LHR", "MAN", "EDI", "GLA", "BHD", "DUB", "NCL"],
    aircraftNote: "Short-haul and CityFlyer aircraft",
    rewards: {
      vaPoints: 125,
      tierPoints: 10,
      badge: "British Isles Relay",
    },
  },
  {
    id: "evt-transatlantic-club-2026-09",
    slug: "transatlantic-club-world-weekend",
    title: "Transatlantic Club World Weekend",
    typeLabel: "Long-haul Event",
    category: "long-haul",
    summary: "Experience the Atlantic together in Club World style.",
    description: "A coordinated transatlantic event featuring a choice of North American destinations, long-haul aircraft and a shared departure window from Heathrow.",
    date: "2026-09-30",
    startUtc: "15:00",
    endUtc: "23:59",
    route: {
      from: "EGLL",
      to: "KJFK",
      fromName: "London Heathrow",
      toName: "New York JFK",
    },
    image: "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=1400&q=86",
    imagePosition: "center 40%",
    published: true,
    registrationOpen: true,
    participantCount: 305,
    featuredDestinations: ["LHR", "JFK", "BOS", "IAD", "ORD", "YYZ", "MIA"],
    aircraftNote: "Wide-body fleet recommended",
    rewards: {
      vaPoints: 200,
      tierPoints: 20,
      badge: "Transatlantic Club World Weekend",
    },
  },
  {
    id: "evt-cityflyer-challenge-2026-10",
    slug: "cityflyer-challenge",
    title: "BA CityFlyer Challenge",
    typeLabel: "Challenge",
    category: "challenge",
    summary: "A precision-focused regional challenge from Gatwick.",
    description: "Complete the published CityFlyer-style sector within the event window and aim for an on-time arrival and smooth landing for the full reward bonus.",
    date: "2026-10-07",
    startUtc: "18:00",
    endUtc: "21:30",
    route: {
      from: "EGKK",
      to: "EHAM",
      fromName: "London Gatwick",
      toName: "Amsterdam",
    },
    image: "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?auto=format&fit=crop&w=1400&q=86",
    published: true,
    registrationOpen: true,
    participantCount: 176,
    featuredDestinations: ["LGW", "AMS"],
    aircraftNote: "Embraer E190 recommended",
    rewards: {
      vaPoints: 150,
      tierPoints: 15,
      badge: "CityFlyer Challenge",
    },
  },
  {
    id: "evt-alpine-arrival-2026-10",
    slug: "alpine-arrival-challenge",
    title: "Alpine Arrival Challenge",
    typeLabel: "Special Challenge",
    category: "challenge",
    summary: "Take on a scenic arrival with a precision bonus.",
    description: "Fly the London to Geneva sector during the published window and complete the arrival within challenge limits to earn the event badge and bonus points.",
    date: "2026-10-15",
    startUtc: "17:30",
    endUtc: "22:00",
    route: {
      from: "EGLL",
      to: "LSGG",
      fromName: "London Heathrow",
      toName: "Geneva",
    },
    image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&q=86",
    imagePosition: "center 45%",
    published: true,
    registrationOpen: true,
    participantCount: 141,
    featuredDestinations: ["LHR", "GVA"],
    aircraftNote: "Short-haul fleet recommended",
    rewards: {
      vaPoints: 175,
      tierPoints: 20,
      badge: "Alpine Arrival Challenge",
    },
  },
  {
    id: "evt-tokyo-night-run-2026-10",
    slug: "tokyo-night-run",
    title: "Tokyo Night Run",
    typeLabel: "Long-haul Event",
    category: "long-haul",
    summary: "A coordinated overnight departure to Tokyo Haneda.",
    description: "Depart Heathrow together for Tokyo and take part in a long-haul community operation designed around an overnight eastbound schedule.",
    date: "2026-10-24",
    startUtc: "19:00",
    endUtc: "23:59",
    route: {
      from: "EGLL",
      to: "RJTT",
      fromName: "London Heathrow",
      toName: "Tokyo Haneda",
    },
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1400&q=86",
    imagePosition: "center 47%",
    published: true,
    registrationOpen: true,
    participantCount: 229,
    featuredDestinations: ["LHR", "HND"],
    aircraftNote: "Long-haul fleet recommended",
    rewards: {
      vaPoints: 200,
      tierPoints: 20,
      badge: "Tokyo Night Run",
    },
  },
];
