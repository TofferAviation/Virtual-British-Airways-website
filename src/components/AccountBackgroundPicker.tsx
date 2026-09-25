"use client";

import { ChangeEvent, useRef, useState } from "react";
import { MAX_ACCOUNT_BACKGROUND_DATA_LENGTH } from "@/lib/profile-image";
import styles from "./AccountBackgroundPicker.module.css";

type Props = {
  value: string | null;
  onChange: (image: string | null) => void | Promise<void>;
};

const MAX_INPUT_BYTES = 12 * 1024 * 1024;
// Only resize when an original cannot be retained. The dashboard handles the
// final responsive crop, so preparing a fixed banner here would unnecessarily
// crop and upscale the pilot's image before it ever reaches the account page.
const MAX_RENDER_WIDTH = 3200;
const MAX_RENDER_HEIGHT = 1800;

function prepareBackground(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("That image could not be read."));
        return;
      }

      // Preserve the supplied image byte-for-byte whenever it already fits
      // the private account-state limit. This avoids canvas resampling and
      // WebP recompression of perfectly suitable dashboard photos.
      if (reader.result.length <= MAX_ACCOUNT_BACKGROUND_DATA_LENGTH) {
        resolve(reader.result);
        return;
      }

      const image = new Image();
      image.onerror = () => reject(new Error("That image could not be opened."));
      image.onload = () => {
        if (!image.naturalWidth || !image.naturalHeight) {
          reject(new Error("That image has no usable dimensions."));
          return;
        }

        const scale = Math.min(
          1,
          MAX_RENDER_WIDTH / image.naturalWidth,
          MAX_RENDER_HEIGHT / image.naturalHeight,
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Your browser could not prepare that image."));
          return;
        }

        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.98, 0.95, 0.92, 0.88]) {
          const prepared = canvas.toDataURL("image/webp", quality);
          if (prepared.length <= MAX_ACCOUNT_BACKGROUND_DATA_LENGTH) {
            resolve(prepared);
            return;
          }
        }
        reject(new Error("That image is too large for a private dashboard background. Choose a JPG or WebP under 2.4 MB for original-quality display."));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function AccountBackgroundPicker({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      setMessage("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setMessage("Choose an image under 12 MB.");
      return;
    }

    setBusy(true);
    setMessage("Preparing dashboard background…");
    try {
      await onChange(await prepareBackground(file));
      setMessage("Dashboard background updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare that image.");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    setBusy(true);
    setMessage("Removing dashboard background…");
    try {
      await onChange(null);
      setMessage("Dashboard background removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove that background.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.picker} id="account-background" aria-labelledby="account-background-title">
      <div className={styles.preview} style={value ? { backgroundImage: `linear-gradient(100deg, rgba(7, 36, 84, .44), rgba(7, 71, 148, .28)), url(${value})` } : undefined} aria-hidden="true">
        <span>{value ? "Personal background" : "BAV blue background"}</span>
      </div>
      <div className={styles.copy}>
        <strong id="account-background-title">Account background</strong>
        <small>Add a landscape image behind the account welcome panel. A JPG, PNG or WebP that fits within 2.4 MB keeps its original quality; larger images are reduced without stretching or pre-cropping. It is shown only on your signed-in dashboard, never on public pages or in Ember.</small>
      </div>
      <input className={styles.input} ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} hidden />
      <div className={styles.actions}>
        <button type="button" className={styles.choose} onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? "Preparing…" : value ? "Change background" : "Choose background"}</button>
        {value ? <button type="button" className={styles.remove} onClick={removeImage} disabled={busy}>Use BAV blue</button> : null}
      </div>
      {message ? <span className={styles.message} role="status">{message}</span> : null}
    </section>
  );
}
