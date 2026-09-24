"use client";

import Link from "next/link";
import { useState } from "react";

const DEFAULT_NEWS_HERO = "/branding/news-announcements-hero.png";

type Props = {
  mode: "image" | "editable";
  image: string;
  imagePosition: string;
  kicker: string;
  title: string;
  description: string;
  sideTitle: string;
  sideText: string;
  latestUpdate: { title: string; href: string; date: string } | null;
};

export function NewsHeroBanner({ mode, image, imagePosition, kicker, title, description, sideTitle, sideText, latestUpdate }: Props) {
  const [failedImages, setFailedImages] = useState<string[]>([]);

  const preferredImage = image || DEFAULT_NEWS_HERO;
  const activeImage = !failedImages.includes(preferredImage)
    ? preferredImage
    : preferredImage !== DEFAULT_NEWS_HERO && !failedImages.includes(DEFAULT_NEWS_HERO)
      ? DEFAULT_NEWS_HERO
      : "";

  const effectivePosition = activeImage === DEFAULT_NEWS_HERO && imagePosition === "center center"
    ? "center 55%"
    : imagePosition || "center 55%";

  if (mode === "image" && activeImage) {
    return (
      <section className="news-hero news-hero-image-mode" aria-label="News & announcements">
        <div className="news-shell news-hero-image-shell">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="news-hero-banner-image"
            src={activeImage}
            alt=""
            aria-hidden="true"
            style={{ objectPosition: effectivePosition }}
            onError={() => setFailedImages((current) => current.includes(activeImage) ? current : [...current, activeImage])}
          />
        </div>
      </section>
    );
  }

  return (
    <section className={`news-hero${mode === "image" ? " news-hero-fallback" : ""}`}>
      <div className="news-shell news-hero-inner">
        <div className="news-hero-copy">
          <span className="news-kicker">{kicker}</span>
          <h1>{title}</h1>
          <i />
          <p>{description}</p>
        </div>
        <div className="news-hero-latest">
          <span className="news-hero-latest-label">{sideTitle}</span>
          <h2>{latestUpdate?.title ?? sideText}</h2>
          {latestUpdate ? <time>{latestUpdate.date}</time> : null}
          {latestUpdate ? <Link href={latestUpdate.href}>Read update <span aria-hidden="true">→</span></Link> : null}
        </div>
      </div>
    </section>
  );
}
