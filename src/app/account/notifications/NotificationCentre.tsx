"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PilotNotification } from "@/lib/pilot-store";
import styles from "./notifications.module.css";

function when(value: string) {
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.round(difference / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function NotificationCentre({ initialNotifications }: { initialNotifications: PilotNotification[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [busy, setBusy] = useState(false);
  const unread = useMemo(() => notifications.filter((notification) => notification.readAt === null).length, [notifications]);

  async function markRead(id: string) {
    const notification = notifications.find((item) => item.id === id);
    if (!notification || notification.readAt) return;
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    await fetch("/api/pilot/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => undefined);
  }

  async function markAllRead() {
    if (!unread || busy) return;
    setBusy(true);
    setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt: new Date().toISOString() }));
    await fetch("/api/pilot/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => undefined);
    setBusy(false);
  }

  return <section className={styles.centre} aria-label="BAV Operations notifications">
    <header className={styles.header}><div><span>BAV OPERATIONS</span><h1>Notifications</h1><p>Important updates about your flights, PIREPs, career record and BAV account.</p></div>{unread ? <button type="button" onClick={markAllRead} disabled={busy}>{busy ? "Updating…" : `Mark ${unread} as read`}</button> : null}</header>
    {notifications.length ? <div className={styles.list}>{notifications.map((notification) => <article className={`${styles.notification} ${styles[notification.level]}${notification.readAt ? ` ${styles.read}` : ""}`} key={notification.id}>
      <span className={styles.marker} aria-hidden="true">{notification.level === "success" ? "✓" : notification.level === "attention" ? "!" : "i"}</span><div className={styles.content}><div className={styles.head}><strong>{notification.title}</strong><time dateTime={notification.createdAt}>{when(notification.createdAt)}</time></div><p>{notification.body}</p>{notification.href ? <Link href={notification.href} onClick={() => markRead(notification.id)}>Open update →</Link> : <button className={styles.readButton} type="button" onClick={() => markRead(notification.id)}>{notification.readAt ? "Read" : "Mark as read"}</button>}</div>
    </article>)}</div> : <div className={styles.empty}><span aria-hidden="true">✓</span><h2>You&apos;re all caught up</h2><p>When BAV Operations reviews a flight report, transfer credit or career record, the update will appear here and in Ember.</p><Link href="/account">Back to dashboard</Link></div>}
  </section>;
}
