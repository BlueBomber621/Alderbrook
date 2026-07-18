import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes every built asset path relative, so the site works no matter
// what subpath GitHub Pages serves it from (e.g. https://<user>.github.io/<repo>/)
// as well as from a plain file:// or the root of a custom domain.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    // The game is one large module; silence the default 500 kB chunk warning.
    chunkSizeWarningLimit: 4000,
  },
});
