"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { DEFAULT_REWARD_SETTINGS, type RewardSettings } from "@/lib/reward-settings";

type Props = { initialSettings: RewardSettings };

const rewardFields: Array<{ key: keyof RewardSettings; label: string; help: string; min: number; max: number }> = [
  { key: "minimumVaPoints", label: "Minimum VA Points per accepted PIREP", help: "Every approved flight receives at least this many VA Points.", min: 0, max: 10_000 },
  { key: "vaPointsPerFiveBlockMinutes", label: "VA Points per five block minutes", help: "Block time contribution, calculated from the completed PIREP.", min: 0, max: 1_000 },
  { key: "vaPointsPerFiftyNm", label: "VA Points per fifty nautical miles", help: "Distance contribution, calculated from the completed PIREP.", min: 0, max: 1_000 },
  { key: "minimumTierPoints", label: "Minimum Tier Points per accepted PIREP", help: "Every approved flight receives at least this many Tier Points.", min: 0, max: 10_000 },
  { key: "tierPointsPercent", label: "Tier Points as percentage of VA Points", help: "Tier Points are calculated from the final VA Point award.", min: 0, max: 100 },
];

const tierFields: Array<{ key: "tierBronzeThreshold" | "tierSilverThreshold" | "tierGoldThreshold"; label: string; help: string }> = [
  { key: "tierBronzeThreshold", label: "Bronze threshold", help: "Tier Points required for Bronze." },
  { key: "tierSilverThreshold", label: "Silver threshold", help: "Tier Points required for Silver." },
  { key: "tierGoldThreshold", label: "Gold threshold", help: "Tier Points required for Gold." },
];

const firstFlightFields: Array<{ key: "firstFlightBonusVaPoints" | "firstFlightBonusTierPoints"; label: string; help: string }> = [
  { key: "firstFlightBonusVaPoints", label: "First Flight bonus VA Points", help: "Added once when a pilot's first BAV PIREP is accepted." },
  { key: "firstFlightBonusTierPoints", label: "First Flight bonus Tier Points", help: "Added once alongside the First Flight award." },
];

export function RewardSettingsClient({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  function setNumber(key: keyof RewardSettings, value: string) {
    setSettings((current) => ({ ...current, [key]: value === "" ? 0 : Number(value) }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("Saving reward settings…");
    try {
      const response = await fetch("/api/staff/rewards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await response.json().catch(() => ({})) as { settings?: RewardSettings; error?: string };
      if (!response.ok || !body.settings) throw new Error(body.error || "Could not save reward settings.");
      setSettings(body.settings);
      setStatus("Reward settings saved. They will apply to PIREPs approved from now on.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save reward settings.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="reward-settings-page">
    <div className="reward-settings-shell">
      <nav className="reward-settings-breadcrumbs"><Link href="/staff">Staff Centre</Link><span>›</span><strong>Reward Settings</strong></nav>
      <header className="reward-settings-hero"><div><span>BAV PROGRESSION</span><h1>Reward Settings</h1><p>Configure the points awarded when a staff member accepts a pilot PIREP. Existing approved flight records and their rewards are preserved.</p></div><Link href="/staff/pireps">Open PIREP Centre →</Link></header>
      <form className="reward-settings-form" onSubmit={save}>
        <section className="reward-settings-card">
          <div className="reward-settings-heading"><div><span>FLIGHT REWARDS</span><h2>Accepted PIREP calculation</h2><p>VA Points are calculated from block time and distance; Tier Points are a percentage of the final VA Point award.</p></div><div className="reward-settings-formula">VA = max(minimum, block-time + distance)<br />TP = max(minimum, VA × percentage)</div></div>
          <div className="reward-settings-grid">{rewardFields.map((field) => <label key={field.key}><span>{field.label}</span><input type="number" min={field.min} max={field.max} step="1" value={settings[field.key]} onChange={(event) => setNumber(field.key, event.target.value)} /><small>{field.help}</small></label>)}</div>
        </section>
        <section className="reward-settings-card reward-settings-first-flight">
          <div className="reward-settings-heading"><div><span>CAREER AWARD</span><h2>First Flight</h2><p>A permanent First Flight badge is added to a pilot&apos;s profile when staff accepts their first BAV PIREP. It cannot be earned twice.</p></div><div className="reward-settings-award-mark" aria-hidden="true">★</div></div>
          <div className="reward-settings-grid reward-settings-first-grid">{firstFlightFields.map((field) => <label key={field.key}><span>{field.label}</span><input type="number" min="0" max="10000" step="1" value={settings[field.key]} onChange={(event) => setNumber(field.key, event.target.value)} /><small>{field.help}</small></label>)}</div>
        </section>
        <section className="reward-settings-card">
          <div className="reward-settings-heading"><div><span>MEMBERSHIP STATUS</span><h2>Tier thresholds</h2><p>Pilots earn Blue, Bronze, Silver and Gold status from their accumulated Tier Points.</p></div></div>
          <div className="reward-settings-grid reward-settings-tier-grid">{tierFields.map((field) => <label key={field.key}><span>{field.label}</span><input type="number" min="1" max="1000000" step="1" value={settings[field.key]} onChange={(event) => setNumber(field.key, event.target.value)} /><small>{field.help}</small></label>)}</div>
        </section>
        <aside className="reward-settings-note"><strong>Promotion safeguard</strong><span>Pilot rank promotions remain based on accepted flight hours. Reward settings do not change ranks or staff-approved type ratings.</span></aside>
        <footer className="reward-settings-actions"><button type="button" onClick={() => { setSettings({ ...DEFAULT_REWARD_SETTINGS }); setStatus("Default values restored in the form. Save to apply them."); }}>Restore defaults</button><span role="status">{status}</span><button className="primary" disabled={saving} type="submit">{saving ? "Saving…" : "Save reward settings"}</button></footer>
      </form>
    </div>
  </main>;
}
