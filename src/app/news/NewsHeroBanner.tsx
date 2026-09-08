"use client";

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
  tagline: string;
};

export function NewsHeroBanner({ mode, image, imagePosition, kicker, title, description, sideTitle, sideText, tagline }: Props) {
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="news-hero-banner-image"
          src={activeImage}
          alt=""
          aria-hidden="true"
          style={{ objectPosition: effectivePosition }}
          onError={() => setFailedImages((current) => current.includes(activeImage) ? current : [...current, activeImage])}
        />
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
          <strong>{sideTitle}</strong>
          <span>{sideText}</span>
          <i />
          <small>{tagline}</small>
        </div>
        <div className="news-hero-network" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
        <div className="news-hero-tag" aria-hidden="true">People<br />Routes<br />Community<br />Opportunity</div>
      </div>
    </section>
  );
}
