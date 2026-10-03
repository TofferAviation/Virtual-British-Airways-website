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

