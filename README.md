# Alderbrook

An AI town simulator. Three towns, twenty-two souls, real money and real
grudges — and NPC minds, daily plans, and chat powered by the Claude API.

Originally a single-file Claude artifact, Alderbrook now builds and runs as a
plain static site, so it can be hosted anywhere — including **GitHub Pages**.

## Play it

Once GitHub Pages is enabled for this repo (see below), the game is live at:

```
https://<your-username>.github.io/<repo-name>/
```

Open **⚙️ Settings** in-game and paste your own Anthropic API key to switch the
AI on.

## Using a Claude API key

The AI features (NPC behavior, daily "pulses", nudges, chat, and more) call the
Anthropic Messages API **directly from your browser**:

- Get a key at [console.anthropic.com](https://console.anthropic.com).
- In-game: **⚙️ Settings → 🔑 Anthropic API key → paste → Apply key.**
- The key is sent only to `api.anthropic.com`, never to any other server, and
  is stored on your device (via the save file / browser storage) only when you
  save. Clearing the key pauses the AI; the town still runs.
- The model is set in one place near the top of `index.tsx`:
  `const CLAUDE_MODEL = "claude-sonnet-4-6";`

Because the browser talks to Anthropic directly, the request uses the
`anthropic-dangerous-direct-browser-access` header (this is a personal,
bring-your-own-key setup — don't ship a shared key in a public site).

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Build a production bundle:

```bash
npm run build    # outputs to dist/
npm run preview  # serve the built site locally
```

## Deploy to GitHub Pages

A workflow at `.github/workflows/deploy.yml` builds the site and publishes it on
every push to `main`. To turn it on:

1. Push to `main`.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.

That's it — the next push (or a manual run from the **Actions** tab) deploys.
The build uses a relative asset base, so it works from any Pages subpath without
extra configuration.

## Saves

- Autosave and **Continue** use browser storage (`localStorage` on the standalone
  site).
- **⚙️ Settings → 💾 Save file** exports/imports a full save as JSON, which works
  anywhere and moves between devices.

## Project layout

| Path | What it is |
| --- | --- |
| `index.tsx` | The entire game (one big React component). |
| `src/main.tsx` | Entry point: mounts the game, shims `window.storage` to `localStorage`. |
| `index.html` | Vite HTML entry. |
| `vite.config.ts` | Build config (relative base for Pages). |
| `.github/workflows/deploy.yml` | Build + deploy to GitHub Pages. |
