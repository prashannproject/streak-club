"use client";

import { useEffect, useState } from "react";

type Result = { available: boolean; suggestions: string[] };

export function UsernameInput() {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (value.trim().length < 3) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/usernames?q=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        });
        if (response.ok) setResult((await response.json()) as Result);
      } catch {
        // Aborted lookups do not need UI noise.
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  return (
    <label>
      Username
      <input
        name="username"
        required
        minLength={3}
        maxLength={24}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (event.target.value.trim().length < 3) setResult(null);
        }}
        aria-describedby="username-status"
      />
      <span
        id="username-status"
        className={`fieldHint ${result?.available ? "available" : ""}`}
        aria-live="polite"
      >
        {result?.available
          ? "Available ✓"
          : result?.suggestions.length
            ? `Taken. Try ${result.suggestions.map((item) => `@${item}`).join(", ")}`
            : "3–24 letters, numbers, dots, dashes, or underscores."}
      </span>
    </label>
  );
}
