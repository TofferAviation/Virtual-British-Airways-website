import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "oneworld",
  description: "Virtual alliance information for British Airways Virtual pilots.",
};

const members = [
  { name: "Alaska Airlines", code: "AS", region: "North America", community: "vASA · Alaska Virtual", href: "https://www.virtual-asa.com/" },
  { name: "American Airlines", code: "AA", region: "North America", community: "American Airlines Virtual", href: "https://www.aavirtual.com/" },
  { name: "British Airways", code: "BA", region: "United Kingdom", community: "British Airways Virtual", href: "/book", internal: true },
  { name: "Cathay Pacific", code: "CX", region: "Hong Kong", community: "CX Virtual", href: "https://cxvirtual.hk/" },
  { name: "Fiji Airways", code: "FJ", region: "South Pacific", community: "Fiji Airline Virtual", href: "https://www.fijiairvirtual.com/" },
  { name: "Finnair", code: "AY", region: "Finland", community: "Virtual Finnair", href: "https://virtualfinnair.com/" },
  { name: "Hawaiian Airlines", code: "HA", region: "Hawai‘i", community: "vASA · Alaska & Hawaiian", href: "https://www.virtual-asa.com/" },
  { name: "Iberia", code: "IB", region: "Spain", community: "Grupo Iberia Virtual", href: "https://crew.iberiava.net/" },
  { name: "Japan Airlines", code: "JL", region: "Japan", community: "JAL Virtual", href: "https://jalvirtual.com/" },
  { name: "Malaysia Airlines", code: "MH", region: "Malaysia", community: "vMAS · Virtual Malaysia Airlines", href: "https://vmas.my/" },
  { name: "Oman Air", code: "WY", region: "Oman", community: "Oman Air Virtual", href: "https://community.infiniteflight.com/t/25oct26-oman-air-virtual-presents-oman-skies/1279341" },
  { name: "Qantas", code: "QF", region: "Australia", community: "QVirtual", href: "https://www.qvirtual.com.au/" },
  { name: "Qatar Airways", code: "QR", region: "Qatar", community: "Qatar Virtual Airways", href: "https://www.qatarvirtual.net/" },
  { name: "Royal Air Maroc", code: "AT", region: "Morocco", community: "Royal Air Maroc on JetStream Virtual", href: "https://jetstreamvirtual.com/dairlines/RAM" },
  { name: "Royal Jordanian", code: "RJ", region: "Jordan", community: "Royal Jordanian on JetStream Virtual", href: "https://jetstreamvirtual.com/airlines/royal-jordanian" },
  { name: "SriLankan Airlines", code: "UL", region: "Sri Lanka", community: "Explore oneworld Virtual", href: "https://oneworldvirtual.org/airlines" },
].map((member) => ({
  ...member,
  logo: `https://www.gstatic.com/flights/airline_logos/70px/${member.code}.png`,
}));

export default function OneworldPage() {
  return (
    <>
      <SiteHeader />

      <main className="ow-page">
        <div className="ow-breadcrumb-band">
          <div className="ow-breadcrumb-row">
            <div className="ow-breadcrumbs">
              <Link href="/">Home</Link>
              <span aria-hidden="true">›</span>
              <span>Partners and alliances</span>
              <span aria-hidden="true">›</span>
              <strong>oneworld</strong>
            </div>
          </div>
        </div>

        <section className="ow-hero-art" aria-labelledby="ow-hero-title">
          <h1 className="ow-sr-only" id="ow-hero-title">Welcome to oneworld</h1>
          <p className="ow-sr-only">
            Explore the global alliance that inspires partner-airline operations in British Airways Virtual.
            Access shared destinations, alliance benefits and a worldwide virtual community.
          </p>
          <img
            className="ow-hero-art-image"
            src="/branding/oneworld-hero.png"
            alt=""
            aria-hidden="true"
          />
          <a
            className="ow-hero-logo-link"
            href="https://oneworldvirtual.org/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit oneworld Virtual"
            title="Visit oneworld Virtual"
          >
            <span className="ow-sr-only">Visit oneworld Virtual</span>
          </a>
        </section>

        <nav className="ow-section-nav" aria-label="oneworld sections">
          <a href="#overview">oneworld overview</a>
          <a href="#benefits">Virtual pilot benefits</a>
          <a href="#members">Member airlines</a>
        </nav>

        <section className="ow-content" id="overview">
          <div className="ow-intro-grid">
            <div>
              <h2>A global alliance, adapted for flight simulation</h2>
              <p>
                In the real world, oneworld brings together major international airlines across a broad global
                network. On British Airways Virtual, we use that alliance as an immersion layer for future tours,
                partner operations and destination discovery — without representing any real-world commercial
                partnership.
              </p>
              <p>
                Your British Airways Virtual account, VA Points and pilot progression remain part of our own
                virtual-airline system. Alliance features shown here are for simulation and community flying only.
              </p>
            </div>
            <aside className="ow-notice">
              <strong>Virtual airline notice</strong>
              <p>
                British Airways Virtual is independent and is not affiliated with British Airways Plc, oneworld,
                or any member airline listed on this page.
              </p>
            </aside>
          </div>
        </section>

        <section className="ow-benefits" id="benefits">
          <div className="ow-content">
            <span className="ow-kicker">For our pilots</span>
            <h2>Virtual alliance benefits</h2>
            <div className="ow-benefit-grid">
              <article>
                <span className="ow-benefit-number">01</span>
                <h3>Partner-airline tours</h3>
                <p>Future community events can combine BA Virtual sectors with routes inspired by alliance members.</p>
              </article>
              <article>
                <span className="ow-benefit-number">02</span>
                <h3>Global destination discovery</h3>
                <p>Use the alliance network as inspiration when choosing your next long-haul or connecting flight.</p>
              </article>
              <article>
                <span className="ow-benefit-number">03</span>
                <h3>Shared career immersion</h3>
                <p>Alliance activity can later feed into Ember-connected events, badges and virtual pilot achievements.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="ow-content ow-members" id="members">
          <span className="ow-kicker">Alliance reference</span>
          <h2>oneworld member airlines</h2>
          <p className="ow-members-lead">
            Explore a selected independent virtual-airline community for each real-world member. British Airways
            opens our own virtual operation. External links are community recommendations, not partnerships or
            endorsements by oneworld or any real-world airline.
          </p>
          <div className="ow-member-grid">
            {members.map((member) => {
              const card = <>
                <div className="ow-member-logo">
                  <img src={member.logo} alt={`${member.name} logo`} loading="lazy" />
                </div>
                <div>
                  <h3>{member.name}</h3>
                  <p>{member.region} · {member.community}</p>
                </div>
                <span className="ow-card-arrow" aria-hidden="true">→</span>
              </>;

              return member.internal ? (
                <Link className="ow-member-card" key={member.code} href={member.href} aria-label={`Open ${member.community}`}>
                  {card}
                </Link>
              ) : (
                <a className="ow-member-card" key={member.code} href={member.href} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${member.community} (opens in a new tab)`}>
                  {card}
                </a>
              );
            })}
          </div>
        </section>

        <section className="ow-cta">
          <div>
            <span className="ow-kicker">British Airways Virtual</span>
            <h2>Ready for your next virtual sector?</h2>
            <p>Browse the BA Virtual network and choose your next available assignment.</p>
          </div>
          <Link className="button button-primary" href="/book">Find a virtual flight</Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
