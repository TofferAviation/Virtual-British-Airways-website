import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "About the VA",
  description: "Features, future plans and roadmap for British Airways Virtual.",
};

const features = [
  {
    number: "01",
    title: "British Airways-inspired network",
    copy: "Browse a structured virtual route network, search available sectors and choose flights from the same destination-led experience used across the site.",
  },
  {
    number: "02",
    title: "Pilot career account",
    copy: "A single pilot profile brings together flight history, hours, landing performance, on-time rate, VA Points, tier progression and current assignments.",
  },
  {
    number: "03",
    title: "Fleet operations",
    copy: "Explore the virtual fleet by operating family today, with live registrations, aircraft availability, maintenance state and operational restrictions planned for the backend.",
  },
  {
    number: "04",
    title: "vAMSYS connection",
    copy: "The platform is being built around vAMSYS authentication and operational data so pilots can carry one VA identity across the website and our wider ecosystem.",
  },
  {
    number: "05",
    title: "Phoenix ecosystem",
    copy: "Website assignments and career information are designed to feed into Phoenix so the same pilot journey can continue between planning, flying and post-flight review.",
  },
  {
    number: "06",
    title: "Destination discovery",
    copy: "BA-inspired destination pages make the network feel like an airline product rather than a database, while keeping everything focused on flight simulation.",
  },
];

const roadmap = [
  {
    status: "Now",
    phase: "Foundation",
    title: "Build the complete pilot-facing experience",
    copy: "Core website design, responsive navigation, destinations, fleet, flight search, pilot account views, virtual membership and the shared British Airways Virtual visual system.",
  },
  {
    status: "Next",
    phase: "Integration",
    title: "Connect the website to live pilot data",
    copy: "vAMSYS sign-in and API data, live pilot statistics, schedule availability, assignment handoff and a shared data contract between the website and Phoenix.",
  },
  {
    status: "Planned",
    phase: "Operations",
    title: "Turn the site into a live operations layer",
    copy: "Dynamic fleet registrations, aircraft status, maintenance information, route restrictions, richer dispatch data and SimBrief-assisted pre-flight workflows.",
  },
  {
    status: "Later",
    phase: "Expansion",
    title: "Grow the virtual airline around the community",
    copy: "Tours, events, alliance-inspired operations, achievements, richer career milestones, member recognition and deeper Phoenix integration across the pilot experience.",
  },
];

const futurePlans = [
  ["Two-way Phoenix sync", "Assignments, completed flights and career data shared between the website and Phoenix."],
  ["Live operational fleet", "Registrations, service state, maintenance and aircraft availability driven by backend records."],
  ["Smarter flight planning", "More operational context around schedules, aircraft suitability, SimBrief and pre-flight preparation."],
  ["Community operations", "Tours, events, badges and alliance-inspired flying that adds variety without changing the core BA Virtual identity."],
];

export default function AboutPage() {
  return (
    <>
      <SiteHeader />

      <main className="about-va-page">
        <div className="about-va-breadcrumbs">
          <Link href="/">Home</Link>
          <span aria-hidden="true">›</span>
          <span>British Airways Virtual</span>
          <span aria-hidden="true">›</span>
          <strong>About the VA</strong>
        </div>

        <section
          className="about-va-banner"
          role="img"
          aria-label="About the VA. Built around the operation, not just the flight. British Airways Virtual is being developed as a complete connected pilot experience."
        >
          <span className="about-va-visually-hidden">
            Built around the operation, not just the flight. British Airways Virtual is being developed as a complete pilot experience combining a realistic route network, career progression, live operational data and Phoenix integration.
          </span>
        </section>

        <nav className="about-va-section-nav" aria-label="About the VA sections">
          <a href="#overview">Overview</a>
          <a href="#features">Features</a>
          <a href="#roadmap">Roadmap</a>
          <a href="#future">Future plans</a>
        </nav>

        <section className="about-va-content" id="overview">
          <div className="about-va-intro-grid">
            <div>
              <span className="about-va-kicker">Our direction</span>
              <h2>A virtual airline designed to feel like an airline product</h2>
              <p>
                The goal is not to recreate the real British Airways website for ticket sales. It is to borrow the
                clarity, structure and visual discipline of an airline experience and apply it to virtual-airline
                operations.
              </p>
              <p>
                Pilots should be able to discover destinations, select realistic flights, review their career,
                understand their fleet and carry the same information into Phoenix without feeling like they are
                moving between unrelated tools.
              </p>
            </div>
            <aside className="about-va-notice">
              <strong>Flight simulation only</strong>
              <p>
                British Airways Virtual is an independent virtual-airline project. It is not British Airways Plc
                and does not sell or manage real-world flights, tickets or customer accounts.
              </p>
            </aside>
          </div>
        </section>

        <section className="about-va-features" id="features">
          <div className="about-va-content about-va-content-compact">
            <span className="about-va-kicker">What we are building</span>
            <h2>Core features</h2>
            <p className="about-va-lead">
              The current product foundation already covers the major pilot-facing areas, while the live data layer
              will progressively replace development placeholders as integrations come online.
            </p>
            <div className="about-va-feature-grid">
              {features.map((feature) => (
                <article key={feature.number}>
                  <span className="about-va-feature-number">{feature.number}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="about-va-content about-va-roadmap" id="roadmap">
          <span className="about-va-kicker">Development roadmap</span>
          <h2>Where British Airways Virtual is heading</h2>
          <p className="about-va-lead">
            The roadmap is intentionally phased so the visible pilot experience can mature alongside the backend
            integrations it depends on.
          </p>

          <div className="about-va-roadmap-list">
            {roadmap.map((item, index) => (
              <article key={item.phase}>
                <div className="about-va-roadmap-index">{String(index + 1).padStart(2, "0")}</div>
                <div className="about-va-roadmap-main">
                  <div className="about-va-roadmap-meta">
                    <span className={`about-va-status about-va-status-${item.status.toLowerCase()}`}>{item.status}</span>
                    <span>{item.phase}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="about-va-future" id="future">
          <div className="about-va-content about-va-content-compact">
            <span className="about-va-kicker">Looking ahead</span>
            <h2>Future plans</h2>
            <div className="about-va-future-grid">
              {futurePlans.map(([title, copy]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  <span aria-hidden="true">→</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="about-va-cta">
          <div>
            <span className="about-va-kicker">British Airways Virtual</span>
            <h2>See the operation in action</h2>
            <p>Browse the network, explore the fleet or choose your next virtual sector.</p>
          </div>
          <div className="about-va-cta-actions">
            <Link className="button button-primary" href="/book">Find a virtual flight</Link>
            <Link className="about-va-secondary-link" href="/fleet">Explore the fleet →</Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
