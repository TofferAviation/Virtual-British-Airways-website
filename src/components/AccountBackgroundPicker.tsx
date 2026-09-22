"use client";

import { ChangeEvent, useRef, useState } from "react";
import { MAX_ACCOUNT_BACKGROUND_DATA_LENGTH } from "@/lib/profile-image";
import styles from "./AccountBackgroundPicker.module.css";

type Props = {
  value: string | null;
  onChange: (image: string | null) => void | Promise<void>;
};

const MAX_INPUT_BYTES = 12 * 1024 * 1024;
// The account page is intentionally wide on desktop. Keep enough pixels for
// a crisp full-width hero without sending the original photo to the server.
const WIDTH = 2560;
const HEIGHT = 960;

function resizeToBackground(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("That image could not be read."));
        return;
      }

      const image = new Image();
      image.onerror = () => reject(new Error("That image could not be opened."));
      image.onload = () => {
        if (!image.naturalWidth || !image.naturalHeight) {
          reject(new Error("That image has no usable dimensions."));
          return;
        }

        const sourceRatio = image.naturalWidth / image.naturalHeight;
        const targetRatio = WIDTH / HEIGHT;
        const sourceWidth = sourceRatio > targetRatio ? image.naturalHeight * targetRatio : image.naturalWidth;
        const sourceHeight = sourceRatio > targetRatio ? image.naturalHeight : image.naturalWidth / targetRatio;
        const sourceX = (image.naturalWidth - sourceWidth) / 2;
        const sourceY = (image.naturalHeight - sourceHeight) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Your browser could not prepare that image."));
          return;
        }

        context.imageSmoothingQuality = "high";
        context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, WIDTH, HEIGHT);
        for (const quality of [0.92, 0.88, 0.84, 0.8]) {
          const prepared = canvas.toDataURL("image/webp", quality);
          if (prepared.length <= MAX_ACCOUNT_BACKGROUND_DATA_LENGTH) {
            resolve(prepared);
            return;
          }
        }
        reject(new Error("That image is too detailed to use as a dashboard background. Please choose a simpler image."));
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
      await onChange(await resizeToBackground(file));
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
        <small>Add a personal image behind the blue account welcome panel. It is shown only on your signed-in dashboard, never on public pages or in Ember.</small>
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
