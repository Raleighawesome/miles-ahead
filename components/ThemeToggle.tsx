"use client";

import React from "react";
import { Button } from "./ui/button";

/**
 * ThemeToggle switches between light and dark themes.
 * - Saves user preference in localStorage under key "theme".
 * - Applies the `dark` class on the <html> element.
 * - Uses simple emoji icons for zero-dependency clarity.
 */
export default function ThemeToggle() {
  const [isDark, setIsDark] = React.useState<boolean>(true);

  React.useEffect(() => {
    try {
      const userPref = localStorage.getItem("theme");
      const initial = userPref ? userPref === "dark" : true;
      setIsDark(initial);
      document.documentElement.classList.toggle("dark", initial);
    } catch {
      // ignore localStorage access errors
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    try {
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // ignore localStorage access errors
    }
  };

  return (
    <Button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
      variant="ghost"
      className="rounded-full px-3"
      aria-pressed={isDark}
    >
      <span className="text-lg" role="img" aria-hidden>
        {isDark ? "🌙" : "☀️"}
      </span>
    </Button>
  );
}


