"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const storageKey = "bav-first-visit-welcome-dismissed";

function subscribeToWelcomePreference(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getWelcomePreferenceSnapshot() {
  try {
    return window.localStorage.getItem(storageKey) === "true" ? "dismissed" : "open";
  } catch {
    return "open";
  }
}

function getServerWelcomePreferenceSnapshot() {
  return "pending";
}

export function FirstVisitWelcome() {
  const welcomePreference = useSyncExternalStore(subscribeToWelcomePreference, getWelcomePreferenceSnapshot, getServerWelcomePreferenceSnapshot);
  const [dismissedForVisit, setDismissedForVisit] = useState(false);
  const [rememberDismissal, setRememberDismissal] = useState(false);
  const continueButton = useRef<HTMLButtonElement>(null);

  const isOpen = welcomePreference === "open" && !dismissedForVisit;

  const dismiss = useCallback(() => {
    if (rememberDismissal) {
      try {
        window.localStorage.setItem(storageKey, "true");
      } catch {
        // The current visit may still continue even when storage is unavailable.
      }
    }
    setDismissedForVisit(true);
  }, [rememberDismissal]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => continueButton.current?.focus(), 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [dismiss, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="welcome-notice-backdrop" role="presentation">
      <section className="welcome-notice" role="dialog" aria-modal="true" aria-labelledby="welcome-notice-title" aria-describedby="welcome-notice-description">
        <button className="welcome-notice-close" type="button" aria-label="Continue to the website" onClick={dismiss}>×</button>
        <div className="welcome-notice-mark" aria-hidden="true">✈</div>
        <p className="welcome-notice-kicker">Before you continue</p>
        <h1 id="welcome-notice-title">Welcome to British Airways<br />Virtual Airline</h1>
        <div className="welcome-notice-rule" aria-hidden="true" />
        <div className="welcome-notice-copy" id="welcome-notice-description">
          <p>We are a virtual airline, inspired by one of the world&apos;s largest airlines and its daily operations. We are not affiliated with British Airways in any way, but our project draws inspiration from their remarkable success in the air travel industry and aims to bring that experience to the flight simulation community.</p>
          <p>If you are looking for a real flight, please visit the official British Airways website at <a href="https://www.britishairways.com/" target="_blank" rel="noreferrer">britishairways.com</a>.</p>
          <p>Safe travels, and enjoy the flight!</p>
        </div>
        <label className="welcome-notice-checkbox">
          <input type="checkbox" checked={rememberDismissal} onChange={(event) => setRememberDismissal(event.target.checked)} />
          <span>Don&apos;t show this message again</span>
        </label>
        <div className="welcome-notice-actions">
          <button ref={continueButton} type="button" className="welcome-notice-continue" onClick={dismiss}>Continue to website <span aria-hidden="true">→</span></button>
          <a className="welcome-notice-external" href="https://www.britishairways.com/" target="_blank" rel="noreferrer">Visit British Airways <span aria-hidden="true">↗</span></a>
        </div>
        <div className="welcome-notice-footer"><span /> Virtual aviation brings people together <span /></div>
      </section>
    </div>
  );
}
