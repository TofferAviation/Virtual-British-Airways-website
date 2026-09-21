"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function SiteTrafficTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/api") || pathname.startsWith("/staff")) return;
    try {
      const day = new Date().toISOString().slice(0, 10);
      const visitKey = `bav-traffic-visit-${day}`;
      const pageKey = `bav-traffic-page-${pathname}`;
      if (window.sessionStorage.getItem(pageKey)) return;
      const visit = !window.sessionStorage.getItem(visitKey);
      window.sessionStorage.setItem(pageKey, "1");
      if (visit) window.sessionStorage.setItem(visitKey, "1");
      void fetch("/api/traffic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: pathname, visit }),
        keepalive: true,
      });
    } catch {
      // Private browsing or tracker blocking must not affect the website.
    }
  }, [pathname]);

  return null;
}
