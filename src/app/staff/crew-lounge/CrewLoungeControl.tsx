"use client";

import { FormEvent, useMemo, useState } from "react";

type CrewLoungeEvent = {
  id: string;
  title: string;
  typeLabel: string;
  date: string;
  startUtc: string;
  route: { from: string; to: string; fromName: string; toName: string };
};

type CrewLoungeSettings = {
  featuredEventId: string | null;
  hostName: string;
  hostMessage: string;
  welcomePrompt: string;
};

type Props = { initialSettings: CrewLoungeSettings; initialEvents: CrewLoungeEvent[] };

function eventLabel(event: CrewLoungeEvent) {
  return `${event.date} · ${event.title} · ${event.route.from}–${event.route.to}`;
}

export function CrewLoungeControl({ initialSettings, initialEvents }: Props) {
  const [featuredEventId, setFeaturedEventId] = useState(initialSettings.featuredEventId ?? "");
  const [hostName, setHostName] = useState(initialSettings.hostName);
  const [hostMessage, setHostMessage] = useState(initialSettings.hostMessage);
  const [welcomePrompt, setWelcomePrompt] = useState(initialSettings.welcomePrompt);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const chosenEvent = useMemo(() => initialEvents.find((event) => event.id === featuredEventId) ?? null, [featuredEventId, initialEvents]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/staff/crew-room", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: { featuredEventId: featuredEventId || null, hostName, hostMessage, welcomePrompt } }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "The Crew Lounge settings could not be saved.");
      setMessage("Crew Lounge settings saved. Ember will use this event and host note after its next refresh.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Crew Lounge settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="staff-page crew-lounge-settings-page">
      <div className="staff-breadcrumb-band"><div className="staff-shell staff-breadcrumbs"><a href="/staff">Staff centre</a><span>›</span><strong>Ember systems</strong><span>›</span><strong>Crew Lounge</strong></div></div>
      <section className="staff-shell crew-lounge-settings-shell">
        <header className="crew-lounge-settings-hero"><span className="staff-kicker">Ember systems</span><h1>Crew Lounge host desk</h1><p>Set the conversation tone and choose one published BAV calendar event for the featured crew table in Ember.</p></header>
        <form className="crew-lounge-settings-card" onSubmit={save}>
          <div className="crew-lounge-settings-section">
            <div><span className="staff-kicker">Featured crew table</span><h2>Pick the table pilots see first</h2><p>Only published calendar events appear here. The table is a social planning space; official registration remains on BAV.</p></div>
            <label className="crew-lounge-field"><span>Featured BAV event</span><select value={featuredEventId} onChange={(event) => setFeaturedEventId(event.target.value)}><option value="">No featured event — general lounge only</option>{initialEvents.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}</select></label>
            {chosenEvent ? <aside className="crew-lounge-event-preview"><strong>{chosenEvent.title}</strong><span>{chosenEvent.typeLabel} · {chosenEvent.date} · {chosenEvent.startUtc} UTC</span><small>{chosenEvent.route.fromName} ({chosenEvent.route.from}) → {chosenEvent.route.toName} ({chosenEvent.route.to})</small></aside> : null}
          </div>
          <div className="crew-lounge-settings-section">
            <div><span className="staff-kicker">Pinned host note</span><h2>Make the room feel looked after</h2><p>This appears as a BAV Community note, not as a message from an individual pilot.</p></div>
            <div className="crew-lounge-field-grid"><label className="crew-lounge-field"><span>Host name</span><input maxLength={80} value={hostName} onChange={(event) => setHostName(event.target.value)} /></label><label className="crew-lounge-field crew-lounge-field-wide"><span>Host note</span><textarea rows={4} maxLength={360} value={hostMessage} onChange={(event) => setHostMessage(event.target.value)} /></label><label className="crew-lounge-field crew-lounge-field-wide"><span>Conversation prompt</span><input maxLength={160} value={welcomePrompt} onChange={(event) => setWelcomePrompt(event.target.value)} /></label></div>
          </div>
          <aside className="crew-lounge-honesty-note"><strong>Clear pilot expectations</strong><span>“I&apos;m planning to fly” is voluntary. It never books a slot, changes a roster, or confirms event attendance. Pilots register through the normal BAV event flow.</span></aside>
          <footer className="crew-lounge-settings-actions"><a className="staff-secondary-button" href="/staff">Back to Staff centre</a><div>{message ? <span className="crew-lounge-save-message" role="status">{message}</span> : null}<button className="staff-primary-button" disabled={saving} type="submit">{saving ? "Saving…" : "Save Crew Lounge"}</button></div></footer>
        </form>
      </section>
    </main>
  );
}
