import React from "react";
import { createRoot } from "react-dom/client";
import Alderbrook from "../index.tsx";

/* --------------------------------------------------------------------------
   window.storage shim.
   Inside the Claude artifact host, `window.storage` is provided for us. On a
   standalone build (GitHub Pages, local dev) it doesn't exist, so the game's
   autosave / "Continue" would silently do nothing. We back it with
   localStorage here, matching the tiny async API the game expects:
     get(key)    -> { value: string | null }
     set(key, v) -> void
     delete(key) -> void
   The game file itself stays untouched.
-------------------------------------------------------------------------- */
if (!(window as any).storage) {
  (window as any).storage = {
    async get(key: string) {
      try {
        return { value: localStorage.getItem(key) };
      } catch {
        return { value: null };
      }
    },
    async set(key: string, value: string) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* quota / private mode — session-only, the game handles this */
      }
    },
    async delete(key: string) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* nothing to clean up */
      }
    },
  };
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <Alderbrook />
  </React.StrictMode>,
);
