"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem("bav-theme", nextTheme);
    } catch {
      // The theme still works for the current page if storage is unavailable.
    }
    setTheme(nextTheme);
  }

  const switchingTo = theme === "dark" ? "light" : "dark";

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${switchingTo} mode`}
      title={`Switch to ${switchingTo} mode`}
    >
      <span className="theme-toggle-icon" aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span className="theme-toggle-label">{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
