"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

type Topic = {
  title: string;
  description: string;
  href: string;
  icon: string;
  keywords: string;
};

const topics: Topic[] = [
  { title: "Getting started", description: "New to BAV? Learn the basics and get flying.", href: "/about-your-account", icon: "✈", keywords: "new pilot create account start join vamsys" },
  { title: "Pilot login", description: "How to log in and troubleshoot access issues.", href: "/login", icon: "◯", keywords: "login sign in account vamsys password access" },
  { title: "Your account", description: "Manage your profile, settings and preferences.", href: "/about-your-account", icon: "⚙", keywords: "account profile settings preferences" },
  { title: "Flight assignments", description: "Find and select flights from our virtual network.", href: "/book", icon: "✈", keywords: "book flight assignment route schedule network" },
  { title: "VA Points & Tier Points", description: "Understand your progress and how points work.", href: "/va-points", icon: "▥", keywords: "points va tier status progression rewards" },
  { title: "Events & community", description: "Join events and get involved with other pilots.", href: "/events", icon: "◎", keywords: "events community discord group challenge" },
];

const faqs = [
  ["How do I create an account?", "British Airways Virtual is being prepared for vAMSYS-based pilot identity. During development, the website uses its demo account flow; production authentication will not ask you to hand your vAMSYS password directly to this site."],
  ["Why can’t I log in?", "Check that you are using the current development login flow. When production authentication is connected, account status and access will be handed off through the approved vAMSYS integration."],
  ["How do I book and log a flight?", "Use Book to browse the virtual schedule and choose a flight. The current assignment data is developmental; the future shared backend will keep website and Phoenix records aligned."],
  ["What are VA Points and Tier Points?", "They are British Airways Virtual progression systems only. They are not Avios, have no cash value and are not connected to real-world British Airways customer accounts."],
  ["Do you run events?", "Yes. The Events page supports community flights, long-haul events and special challenges, with the data structure prepared for future administration tools."],
  ["How do I get support?", "Use the Help centre, community channels and future support-ticket tools. Production support links will be connected as those services are finalised."],
];

const quickActions = [
  ["Contact the team", "Get in touch with our support team for help and advice.", "#support", "✉"],
  ["Open a support ticket", "Support-ticket integration will be connected for launch.", "#support", "◇"],
  ["Join Discord", "Community support and pilot discussion.", "#support", "discord"],
  ["Service status", "Check system updates and planned maintenance.", "#support", "◌"],
];

function DiscordIcon() {
  return <img src="/branding/discord-support-icon.png" alt="" aria-hidden="true" />;
}

export function HelpClient() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const results = useMemo(() => {
    const q = submittedQuery.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((topic) => `${topic.title} ${topic.description} ${topic.keywords}`.toLowerCase().includes(q));
  }, [submittedQuery]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(query);
    document.getElementById("help-topics")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="hc-page">
      <section className="hc-shell hc-hero">
        <div className="hc-hero-copy">
          <span className="hc-kicker">Pilot support</span>
          <h1>Help centre</h1>
          <div className="hc-red-line" />
          <p>We&apos;re here to help. Find answers, follow guides or get in touch with the British Airways Virtual team.</p>

          <form className="hc-search" onSubmit={submitSearch} role="search">
            <span className="hc-search-icon" aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search help" placeholder="Search help articles, accounts, flights or support topics..." />
            <button type="submit">Search</button>
          </form>

          <div className="hc-popular">
            <span>Popular searches:</span>
            {["login", "book a flight", "VA Points", "new pilot", "Discord", "account"].map((item) => (
              <button key={item} type="button" onClick={() => { setQuery(item); setSubmittedQuery(item); }}>{item}</button>
            ))}
          </div>
        </div>

        <div className="hc-hero-message" aria-hidden="true">
          <span className="hc-kicker">A global community</span>
          <div className="hc-red-line hc-red-line-small" />
          <p>Fly. Explore. Belong.</p>
        </div>
      </section>

      <section className="hc-shell hc-quick-grid" aria-label="Support shortcuts">
        {quickActions.map(([title, body, href, icon]) => (
          <a key={title} className="hc-quick-card" href={href}>
            <span className={`hc-icon${icon === "discord" ? " hc-icon-discord" : ""}`}>
              {icon === "discord" ? <DiscordIcon /> : icon}
            </span>
            <span><strong>{title}</strong><small>{body}</small></span>
            <b aria-hidden="true">›</b>
          </a>
        ))}
      </section>

      <section className="hc-shell hc-panel" id="help-topics">
        <div className="hc-panel-heading">
          <div><span className="hc-kicker">Popular topics</span><h2>{submittedQuery ? `Results for “${submittedQuery}”` : "Quick help for pilots"}</h2></div>
          {submittedQuery && <button className="hc-text-button" type="button" onClick={() => { setQuery(""); setSubmittedQuery(""); }}>View all help articles →</button>}
        </div>
        <div className="hc-topic-grid">
          {results.length ? results.map((topic) => (
            <Link key={topic.title} className="hc-topic-card" href={topic.href}>
              <span className="hc-icon">{topic.icon}</span>
              <span><strong>{topic.title}</strong><small>{topic.description}</small></span>
              <b aria-hidden="true">›</b>
            </Link>
          )) : <p className="hc-empty">No matching help topics yet. Try another search or use the support options below.</p>}
        </div>
      </section>

      <section className="hc-shell hc-lower-grid">
        <div className="hc-panel">
          <span className="hc-kicker">New pilot guide</span>
          <h2>Get started in four simple steps</h2>
          <p className="hc-muted">Follow these steps to join the community and start flying with British Airways Virtual.</p>
          <div className="hc-steps">
            {[
              ["1", "Create your account", "Sign up and connect with vAMSYS."],
              ["2", "Find a flight", "Search our network and choose a flight."],
              ["3", "Log your flight", "Complete your flight and record your activity."],
              ["4", "Track your progress", "Earn VA Points and build your pilot career."],
            ].map(([number, title, body]) => (
              <article key={number}><span>{number}</span><div><strong>{title}</strong><p>{body}</p></div></article>
            ))}
          </div>
        </div>

        <div className="hc-panel hc-faq-panel">
          <div className="hc-panel-heading"><div><span className="hc-kicker">Frequently asked questions</span><h2>Common questions</h2></div></div>
          <div className="hc-faq-list">
            {faqs.map(([question, answer]) => (
              <details key={question}><summary>{question}<span>⌄</span></summary><p>{answer}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section className="hc-shell hc-panel hc-support" id="support">
        <div className="hc-support-intro"><span className="hc-kicker">Get in touch</span><h2>Need more help?</h2><p className="hc-muted">Our support team and community are here for you.</p></div>
        <div className="hc-support-options">
          <div><span className="hc-icon hc-icon-discord"><DiscordIcon /></span><p><strong>Community support</strong><small>Discord connection will be added using the official server invite.</small></p></div>
          <div><span className="hc-icon">✉</span><p><strong>Support contact</strong><small>Production support email and ticket handling will be connected before launch.</small></p></div>
          <div><span className="hc-icon">◷</span><p><strong>Service status</strong><small>Operational status integration is prepared for the production service.</small></p></div>
        </div>
      </section>

      <section className="hc-shell hc-return">
        <div><span className="hc-kicker">Ready to fly?</span><h2>Return to operations</h2><p>Search the network, book a flight or manage your account.</p></div>
        <div><Link className="button button-primary" href="/book">Search flights</Link><Link className="button button-outline" href="/account">Manage account</Link></div>
      </section>
    </main>
  );
}
