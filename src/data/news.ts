export type NewsCategoryId =
  | "network"
  | "community"
  | "operations"
  | "events"
  | "route"
  | "fleet"
  | "website"
  | "announcement";

export type NewsArticle = {
  id: string;
  slug: string;
  title: string;
  category: NewsCategoryId;
  excerpt: string;
  body: string;
  date: string;
  image: string;
  imagePosition?: string;
  featured: boolean;
  published: boolean;
  author?: string;
};

export const newsCategoryLabels: Record<NewsCategoryId, string> = {
  network: "Network",
  community: "Community",
  operations: "Operations",
  events: "Events",
  route: "Route news",
  fleet: "Fleet",
  website: "Website",
  announcement: "Announcement",
};

export const seedNewsArticles: NewsArticle[] = [
  {
    id: "news-summer-network-expansion-2026",
    slug: "summer-network-expansion-now-live",
    title: "Summer network expansion now live",
    category: "network",
    excerpt: "Explore our biggest network update of the year, with new routes to exciting destinations across Europe, North America and Asia.",
    body: "British Airways Virtual has expanded its virtual network with a wider selection of short-haul and long-haul opportunities for pilots. The update is designed to give the community more choice while keeping the schedule close to the operational character of British Airways. New route assignments will appear progressively through the Book page as schedules are published.\n\nThis is a flight-simulation update only. Routes, schedules and rewards shown by British Airways Virtual have no connection to real-world ticket sales or passenger bookings.",
    date: "2026-09-08",
    image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1800&q=88",
    imagePosition: "center 56%",
    featured: true,
    published: true,
    author: "British Airways Virtual",
  },
  {
    id: "news-new-pilot-onboarding-2026",
    slug: "new-pilot-onboarding-guide-released",
    title: "New pilot onboarding guide released",
    category: "community",
    excerpt: "A step-by-step guide to help new pilots get started with British Airways Virtual.",
    body: "Our refreshed onboarding guidance brings the key first steps together in one place: account access, flight search, assignments, events and progression. The Help Centre remains the best starting point for pilots who are new to the virtual airline.",
    date: "2026-09-06",
    image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=86",
    featured: false,
    published: true,
  },
  {
    id: "news-operations-dashboard-2026",
    slug: "operations-dashboard-improvements",
    title: "Operations dashboard improvements",
    category: "operations",
    excerpt: "A smoother, faster experience with new operational tools and clearer staff workflows.",
    body: "The Staff Centre continues to evolve into the main operational workspace for British Airways Virtual. Recent improvements include event publishing, route overrides, permissions, Service Status controls and protected source maintenance tools.",
    date: "2026-09-05",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=86",
    featured: false,
    published: true,
  },
  {
    id: "news-community-event-schedule-2026",
    slug: "community-event-schedule-updated",
    title: "Community event schedule updated",
    category: "events",
    excerpt: "New dates and details for upcoming British Airways Virtual community events.",
    body: "The public Events page has been refreshed with the latest published events. Pilots can review dates, routes, rewards and event details before joining the community in the virtual skies.",
    date: "2026-09-04",
    image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=86",
    featured: false,
    published: true,
  },
  {
    id: "news-route-nice-2026",
    slug: "new-route-london-to-nice",
    title: "New route: London to Nice",
    category: "route",
    excerpt: "A new short-haul option joins the virtual network for the late-summer schedule.",
    body: "Pilots can now find an additional London to Nice option in the virtual route network when the route is active in the current schedule.",
    date: "2026-09-02",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=84",
    featured: false,
    published: true,
  },
  {
    id: "news-a350-fleet-2026",
    slug: "a350-fleet-now-in-service",
    title: "A350 fleet now in service",
    category: "fleet",
    excerpt: "Our Airbus A350-1000 remains available across selected long-haul virtual operations.",
    body: "The A350-1000 forms part of the British Airways Virtual long-haul fleet. Fleet information is maintained for flight-simulation use and will become increasingly data-driven as the operational backend is expanded.",
    date: "2026-09-01",
    image: "https://images.unsplash.com/photo-1529074963764-98f45c47344b?auto=format&fit=crop&w=1000&q=84",
    featured: false,
    published: true,
  },
  {
    id: "news-spring-flyin-recap-2026",
    slug: "community-fly-in-recap",
    title: "Community Fly-In recap",
    category: "community",
    excerpt: "A big thank you to everyone who took part in our latest community flying weekend.",
    body: "Community flying remains a key part of British Airways Virtual. Event participation, rewards and future badges will continue to be developed as the pilot progression system grows.",
    date: "2026-08-30",
    image: "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=1000&q=84",
    featured: false,
    published: true,
  },
  {
    id: "news-website-updates-2026",
    slug: "website-updates-now-live",
    title: "Website updates now live",
    category: "website",
    excerpt: "A refreshed design and new tools improve the British Airways Virtual website experience.",
    body: "The website continues to move toward a polished British Airways-inspired experience while remaining clearly an independent virtual airline. Recent work includes richer Help, Events, account, permissions and Service Status experiences.",
    date: "2026-08-28",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1000&q=84",
    featured: false,
    published: true,
  },
  {
    id: "news-maintenance-notice-2026",
    slug: "scheduled-maintenance-notice",
    title: "Scheduled maintenance",
    category: "announcement",
    excerpt: "Planned maintenance may briefly affect selected development services.",
    body: "Scheduled maintenance notices are also mirrored through the dedicated Service Status page whenever a maintenance window is active.",
    date: "2026-08-27",
    image: "",
    featured: false,
    published: true,
  },
];
