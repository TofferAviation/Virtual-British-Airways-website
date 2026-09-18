"use client";

import { ChangeEvent, useRef, useState } from "react";
import styles from "./ProfileImagePicker.module.css";

type Props = {
  value: string | null;
  name: string;
  onChange: (image: string | null) => void | Promise<void>;
};

const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const AVATAR_SIZE = 256;

function initials(name: string) {
  const letters = name.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("");
  return letters.toUpperCase() || "BA";
}

function resizeToAvatar(file: File) {
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
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        if (!sourceSize) {
          reject(new Error("That image has no usable dimensions."));
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Your browser could not prepare that image."));
          return;
        }
        context.drawImage(
          image,
          (image.naturalWidth - sourceSize) / 2,
          (image.naturalHeight - sourceSize) / 2,
          sourceSize,
          sourceSize,
          0,
          0,
          AVATAR_SIZE,
          AVATAR_SIZE,
        );
        resolve(canvas.toDataURL("image/webp", 0.86));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function ProfileImagePicker({ value, name, onChange }: Props) {
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
    setMessage("Preparing profile photo…");
    try {
      await onChange(await resizeToAvatar(file));
      setMessage("Profile photo updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare that image.");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    setBusy(true);
    setMessage("Removing profile photo…");
    try {
      await onChange(null);
      setMessage("Profile photo removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove your profile photo.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.picker}>
    <span className={styles.preview} aria-label="Profile photo preview">
      {value ? <img src={value} alt="" /> : <span>{initials(name)}</span>}
    </span>
    <span className={styles.copy}><strong>Profile photo</strong><small>Choose a JPG, PNG or WebP image. It is square-cropped and stored privately with your BAV account.</small></span>
    <input className={styles.input} ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} hidden />
    <span className={styles.actions}>
      <button type="button" className={styles.choose} onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? "Preparing…" : value ? "Change photo" : "Choose photo"}</button>
      {value ? <button type="button" className={styles.remove} onClick={removeImage} disabled={busy}>Remove</button> : null}
    </span>
    {message ? <span className={styles.message} role="status">{message}</span> : null}
  </div>;
}
