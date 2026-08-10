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
  `const CLAUDE_MODEL = "claude-sonnet-5";`
- Every call asks for `thinking: { type: "disabled" }`. Sonnet 5 thinks
  adaptively by default and `max_tokens` covers thinking *and* the answer, so
  leaving it on would burn these small budgets before the JSON reply arrived.

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

## Drawing the icons

Every object in the game is drawn as flat vertex art rather than an emoji, from
recipes in the `ICON_ART` table in `index.tsx` — items, garments, the two wild
species, the civic upgrades and the campaign promises, 152 in all. Furniture is
drawn too, by the older `drawFurnitureArt` painter, and reuses that art as its
icon through the kit's `host` bridge.

To draw your own, open **`tools/icon-studio.html`** in a browser. No build step
and no server: it carries its own copy of the drawing kit, renders every object
live, and redraws on **Ctrl/Cmd+Enter**. Anything with no recipe shows up red,
syntax errors appear in a banner instead of failing silently, and clicking a
tile jumps the editor to that recipe. When you like it, hit **Copy ICON_ART**
and paste over the `ICON_ART` block in `index.tsx`. (Furniture is deliberately
absent — the studio carries the icon kit, not that painter, so it could list
those pieces but never let you edit them.)

A recipe is one function per object, given a kit `k`:

```js
bread: k => SH.loaf(k),                                  // reuse a shared shape
ore:   k => { for (const [x, y, r] of [[-0.14, 0.10, 0.13], [0.12, 0.12, 0.11]])
                k.pg([[x - r, y], [x, y - r], [x + r, y], [x, y + r]], PAL.iron); },
```

- Coordinates run about **−0.45…0.45** from the centre, so one recipe draws at
  any size: 18px in an inventory row or a whole tile on the ground.
- `k` gives you `pg(points, fill)`, `rc(x, y, w, h, fill)`, `ci(x, y, r, fill)`,
  `el(x, y, rx, ry, fill)`, `ln(x1, y1, x2, y2, width, fill)` and
  `tri(a, b, c, fill)`. Drawing order is back to front.
- **`rpg(points, fill, r)`** is the polygon with its corners eased off. `r` is
  one number, or an array giving a radius per vertex — `0` keeps that corner
  sharp, which is how a fish stays pointed at the snout and tail while its
  flanks go soft. Most things want this rather than `pg`.
- **`blob(x, y, rx, ry, fill, bumps, wobble, phase)`** is a circle pushed in and
  out around its rim, for dough, cotton bolls and river cobbles.
- **`ax(x1, y1, x2, y2)`** lays a tool on an axis: `at(t, s)` is a fraction `t`
  from butt to tip, offset `s` across it, and `bar(t0, t1, w, fill, r)` draws
  along it. Use it for anything with a handle — it's what keeps a hammer head
  square to its own haft instead of a few degrees off.
- **`rot(deg)`** returns a mapper, so `pts.map(k.rot(-13))` tilts a whole shape.
- `SH` holds the shared assemblies (`plate`, `bowl`, `mug`, `bottle`,
  `glassCup`, `fishBody`, `loaf`, `haft`, `sack`, `gem`) plus the garment blanks
  (`gShirt`, `gDress`, `gVest`, `gCoat`, `gQuilt`, `gTrous`, `gSkirt`, `gHat`),
  and `PAL` the named colours. Using them is what keeps 152 objects related.

## Project layout

| Path | What it is |
| --- | --- |
| `index.tsx` | The entire game (one big React component). |
| `tools/icon-studio.html` | Standalone live editor for the item art (see above). |
| `src/main.tsx` | Entry point: mounts the game, shims `window.storage` to `localStorage`. |
| `index.html` | Vite HTML entry. |
| `vite.config.ts` | Build config (relative base for Pages). |
| `.github/workflows/deploy.yml` | Build + deploy to GitHub Pages. |
