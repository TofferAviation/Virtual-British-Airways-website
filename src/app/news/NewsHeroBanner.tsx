"use client";

import { useState } from "react";

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
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const imageFailed = failedImage === image;

  if (mode === "image" && image && !imageFailed) {
    return (
      <section className="news-hero news-hero-image-mode">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="news-hero-banner-image"
          src={image}
          alt="News & announcements"
          style={{ objectPosition: imagePosition }}
          onError={() => setFailedImage(image)}
        />
      </section>
    );
  }

  return (
    <section className={`news-hero${mode === "image" && imageFailed ? " news-hero-fallback" : ""}`}>
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
