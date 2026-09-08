"use client";

export function ThemeToggle() {
  function toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem("bav-theme", nextTheme);
    } catch {
      // The theme still works for the current page if storage is unavailable.
    }
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
    >
      <span className="theme-toggle-icon theme-toggle-moon" aria-hidden="true">☾</span>
      <span className="theme-toggle-icon theme-toggle-sun" aria-hidden="true">☀</span>
      <span className="theme-toggle-label theme-toggle-light-label">Dark</span>
      <span className="theme-toggle-label theme-toggle-dark-label">Light</span>
    </button>
  );
}
