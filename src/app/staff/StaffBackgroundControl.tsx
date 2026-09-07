"use client";

import { ChangeEvent, useRef, useState } from "react";

type Props = {
  initialBackground?: string;
};

const PAGE_OVERLAY = "linear-gradient(rgba(245,248,252,.58), rgba(245,248,252,.58))";

function applyPageBackground(background?: string) {
  const page = document.querySelector<HTMLElement>(".staff-page");
  if (!page) return;

  if (!background) {
    page.style.removeProperty("background-image");
    page.style.removeProperty("background-size");
    page.style.removeProperty("background-position");
    page.style.removeProperty("background-repeat");
    page.style.removeProperty("background-attachment");
    return;
  }

  page.style.backgroundImage = `${PAGE_OVERLAY}, url("${background}")`;
  page.style.backgroundSize = "cover";
  page.style.backgroundPosition = "center";
  page.style.backgroundRepeat = "no-repeat";
  page.style.backgroundAttachment = "fixed";
}

function compressBackground(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read that image."));
        return;
      }

      const image = new Image();
      image.onerror = () => reject(new Error("That image could not be opened."));
      image.onload = () => {
        const maxWidth = 2200;
        const maxHeight = 1400;
        const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Your browser could not prepare that image."));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/webp", 0.84);
        if (!dataUrl.startsWith("data:image/")) {
          reject(new Error("Your browser could not prepare that image."));
          return;
        }
        resolve(dataUrl);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function StaffBackgroundControl({ initialBackground }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasBackground, setHasBackground] = useState(Boolean(initialBackground));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function persistBackground(background: string | null) {
    const response = await fetch("/api/staff/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ background }),
    });
    const body = (await response.json().catch(() => ({}))) as { background?: string | null; error?: string };
    if (!response.ok) throw new Error(body.error || "Could not save your staff background.");
    return body.background ?? null;
  }

  async function chooseBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Please choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setMessage("That image is too large. Please choose one under 15 MB.");
      return;
    }

    setBusy(true);
    setMessage("Preparing background…");
    try {
      const prepared = await compressBackground(file);
      if (prepared.length > 3_000_000) throw new Error("That image is still too large after optimisation. Please choose a smaller image.");
      const saved = await persistBackground(prepared);
      if (!saved) throw new Error("The background could not be saved.");
      applyPageBackground(saved);
      setHasBackground(true);
      setMessage("Personal staff background saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your staff background.");
    } finally {
      setBusy(false);
    }
  }

  async function resetBackground() {
    setBusy(true);
    setMessage("");
    try {
      await persistBackground(null);
      applyPageBackground();
      setHasBackground(false);
      setMessage("Staff background reset to default.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset your staff background.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="staff-shell" style={{ display: "flex", justifyContent: "flex-end", paddingTop: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "8px 10px",
          background: "rgba(255,255,255,.94)",
          border: "1px solid #d8e1ea",
          borderRadius: 4,
          boxShadow: "0 4px 14px rgba(15,44,79,.05)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "#edf5fc",
            color: "#075aaa",
            fontSize: 15,
          }}
        >
          ▧
        </span>
        <span style={{ display: "grid", gap: 1, minWidth: 150 }}>
          <strong style={{ fontSize: 10, color: "#071d49" }}>Staff page background</strong>
          <small style={{ fontSize: 8, color: "#67798f" }}>Personal to your account only</small>
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={chooseBackground}
          hidden
        />
        <button
          type="button"
          className="staff-secondary-button"
          style={{ padding: "7px 12px", fontSize: 9 }}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {hasBackground ? "Change image" : "Choose image"}
        </button>
        {hasBackground ? (
          <button
            type="button"
            className="staff-secondary-button"
            style={{ padding: "7px 12px", fontSize: 9 }}
            onClick={resetBackground}
            disabled={busy}
          >
            Reset
          </button>
        ) : null}
        {message ? <span role="status" style={{ fontSize: 8, color: "#45617f", maxWidth: 230 }}>{message}</span> : null}
      </div>
    </div>
  );
}
