"use client";

import { useEffect, useState } from "react";

type Preferences = {
  email: boolean;
  discord: boolean;
  browser: boolean;
};

const storageKey = "bav_status_preferences";
const defaults: Preferences = { email: false, discord: false, browser: false };

export function StatusSubscriptions() {
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [message, setMessage] = useState("Preferences are stored on this device while notification integrations are in development.");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPreferences({ ...defaults, ...(JSON.parse(stored) as Partial<Preferences>) });
      }
    } catch {
      // Local preferences are optional; keep defaults if storage is unavailable.
    }
  }, []);

  async function toggle(key: keyof Preferences) {
    let value = !preferences[key];
    if (key === "browser" && value && "Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        value = false;
        setMessage("Browser notifications were not enabled because notification permission was not granted.");
      } else {
        setMessage("Browser notification preference saved. Live status push delivery will activate when the notification backend is connected.");
      }
    } else {
      setMessage("Preference saved on this device. Email and Discord delivery will activate when those integrations are connected.");
    }

    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore storage failures; the visible state still works for this session.
    }
  }

  const items: Array<{ key: keyof Preferences; icon: string; title: string; description: string }> = [
    { key: "email", icon: "✉", title: "Email updates", description: "Receive service-status emails when delivery is connected." },
    { key: "discord", icon: "◉", title: "Discord alerts", description: "Receive status notices through the BAV Discord integration." },
    { key: "browser", icon: "▯", title: "Status notifications", description: "Allow browser notifications on this device." },
  ];

  return (
    <section className="status-side-card status-subscribe-card">
      <div className="status-card-heading"><span className="status-heading-icon">♟</span><h2>Subscribe to updates</h2></div>
      <p>Get notified about incidents, maintenance and service updates.</p>
      <div className="status-subscription-list">
        {items.map((item) => (
          <button key={item.key} type="button" onClick={() => void toggle(item.key)} className="status-subscription-row">
            <span className="status-subscription-icon">{item.icon}</span>
            <span><b>{item.title}</b><small>{item.description}</small></span>
            <span className={`status-toggle ${preferences[item.key] ? "on" : ""}`} aria-pressed={preferences[item.key]}><i /></span>
          </button>
        ))}
      </div>
      <small className="status-subscription-note">{message}</small>
    </section>
  );
}
