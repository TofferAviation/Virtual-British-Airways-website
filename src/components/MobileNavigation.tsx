"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

type MobileNavigationProps = {
  accountHref: string;
  accountLabel: string;
  isPilotLoggedIn: boolean;
  logoutHref?: string;
  showPilotRegistration: boolean;
  staffHref: string;
};

export function MobileNavigation({ accountHref, accountLabel, isPilotLoggedIn, logoutHref, showPilotRegistration, staffHref }: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const dialogId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="mobile-navigation">
      <button className="mobile-navigation-trigger" type="button" aria-expanded={open} aria-controls={dialogId} onClick={() => setOpen((value) => !value)}>
        <span className="mobile-navigation-trigger-lines" aria-hidden="true"><i /><i /><i /></span>
        <span>Menu</span>
      </button>
      {open ? (
        <div className="mobile-navigation-overlay" id={dialogId} role="dialog" aria-modal="true" aria-label="Website navigation">
          <button className="mobile-navigation-backdrop" type="button" aria-label="Close navigation" onClick={close} />
          <nav className="mobile-navigation-sheet" aria-label="Mobile navigation">
            <div className="mobile-navigation-head">
              <div><span>British Airways Virtual</span><strong>Explore BAV</strong></div>
              <button className="mobile-navigation-close" type="button" aria-label="Close navigation" onClick={close}>×</button>
            </div>

            <div className="mobile-navigation-primary">
              <Link href="/" onClick={close}>Home <span aria-hidden="true">›</span></Link>
              <Link href="/book" onClick={close}>Book a flight <span aria-hidden="true">›</span></Link>
              <Link href="/ba-radar" onClick={close}>BA-Radar live map <span aria-hidden="true">›</span></Link>
              <Link href="/destinations" onClick={close}>Destinations & network <span aria-hidden="true">›</span></Link>
              <Link href="/search" onClick={close}>Search BAV <span aria-hidden="true">›</span></Link>
            </div>

            <div className="mobile-navigation-section">
              <span>Pilot centre</span>
              <Link href={accountHref} onClick={close}>{accountLabel}</Link>
              {isPilotLoggedIn ? <Link href="/manage-assignment" onClick={close}>Current flight & assignment</Link> : null}
              {showPilotRegistration ? <Link href="/register" onClick={close}>Create a pilot account</Link> : null}
              <Link href="/handbook" onClick={close}>BAV handbook</Link>
            </div>

            <div className="mobile-navigation-section">
              <span>Help & operations</span>
              <Link href="/support/tickets" onClick={close}>Support centre</Link>
              <Link href="/service-status" onClick={close}>Service status</Link>
              <Link href={staffHref} onClick={close}>Staff Centre</Link>
            </div>

            {logoutHref ? <Link className="mobile-navigation-logout" href={logoutHref} onClick={close}>Log out</Link> : null}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
