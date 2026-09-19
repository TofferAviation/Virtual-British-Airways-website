"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import type { SiteSearchItem } from "@/data/site-search";

type SiteSearchClientProps = {
  initialQuery: string;
  items: SiteSearchItem[];
};

function normalise(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function SearchGlyph() {
  return <span className="site-search-glyph" aria-hidden="true" />;
}

export function SiteSearchClient({ initialQuery, items }: SiteSearchClientProps) {
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);

  const results = useMemo(() => {
    const normalisedQuery = normalise(submittedQuery);
    const terms = normalisedQuery.split(" ").filter((term) => term.length > 1);

    if (!terms.length) return items.slice(0, 12);

    return items
      .map((item) => {
        const title = normalise(item.title);
        const summary = normalise(item.summary);
        const keywords = normalise(item.keywords);
        const allText = `${title} ${summary} ${keywords} ${normalise(item.section)}`;
        const score = terms.reduce((total, term) => {
          if (title.includes(term)) return total + 10;
          if (keywords.includes(term)) return total + 6;
          if (summary.includes(term)) return total + 4;
          return allText.includes(term) ? total + 2 : total;
        }, 0);
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title))
      .map(({ item }) => item);
  }, [items, submittedQuery]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(query);
    const trimmed = query.trim();
    const url = trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search";
    window.history.replaceState(null, "", url);
  }

  function applySuggestion(value: string) {
    setQuery(value);
    setSubmittedQuery(value);
    window.history.replaceState(null, "", `/search?q=${encodeURIComponent(value)}`);
  }

  const heading = submittedQuery.trim() ? `Results for “${submittedQuery.trim()}”` : "Find the answer you need";

  return (
    <main className="site-search-page">
      <section className="site-search-hero">
        <div className="site-search-shell">
          <span className="site-search-kicker">British Airways Virtual</span>
          <h1>Search BAV</h1>
          <p>Find clear guidance for your account, bookings, SimBrief, Ember, fleet operations and support.</p>
          <form className="site-search-form" onSubmit={submitSearch} role="search">
            <SearchGlyph />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “reserve an aircraft”, “SimBrief” or “reset password”"
              aria-label="Search British Airways Virtual"
            />
            <button type="submit">Search</button>
          </form>
          <div className="site-search-suggestions" aria-label="Popular searches">
            <span>Popular:</span>
            {["Book a flight", "SimBrief", "Reserve aircraft", "Ember", "PIREP", "Reset password"].map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => applySuggestion(suggestion)}>{suggestion}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="site-search-shell site-search-results-section" aria-live="polite">
        <div className="site-search-results-heading">
          <div>
            <span className="site-search-kicker">Site search</span>
            <h2>{heading}</h2>
          </div>
          <span>{results.length} {results.length === 1 ? "answer" : "answers"}</span>
        </div>

        {results.length ? (
          <div className="site-search-results">
            {results.map((item) => (
              <Link className="site-search-result" href={item.href} key={`${item.href}-${item.title}`}>
                <span className="site-search-result-section">{item.section}</span>
                <div><h3>{item.title}</h3><p>{item.summary}</p></div>
                <b aria-hidden="true">→</b>
              </Link>
            ))}
          </div>
        ) : (
          <div className="site-search-empty">
            <span>◌</span>
            <div><h2>No exact answer yet</h2><p>Try a shorter phrase, browse the Handbook or ask the BAV team through a private support ticket.</p></div>
            <div><Link className="button button-primary" href="/handbook">Open handbook</Link><Link className="button button-outline" href="/support/tickets/new">Open a ticket</Link></div>
          </div>
        )}
      </section>

      <section className="site-search-shell site-search-guides">
        <div><span className="site-search-kicker">Useful starting points</span><h2>Go straight to the right area.</h2></div>
        <div>
          <Link href="/handbook">BAV Handbook <b>→</b></Link>
          <Link href="/help">Help Centre <b>→</b></Link>
          <Link href="/book">Book a flight <b>→</b></Link>
          <Link href="/account">Pilot account <b>→</b></Link>
        </div>
      </section>
    </main>
  );
}
