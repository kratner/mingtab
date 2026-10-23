# MingTab

A local-first tab manager for Chrome: save windows as collections, organize them into spaces,
and restore them later. A personal replacement for Toby. See [PLAN.md](PLAN.md) for the feature
evaluation and milestones.

The name comes from *mingtang* (明堂, "bright hall"), the open, uncluttered space in front of a
building in feng shui. A cleared tab bar is the bright hall; MingTab keeps it clear.

## Load it in Chrome

```sh
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick
the `dist/` folder. Click the MingTab toolbar icon to open the side panel; new tabs open the board.

For live reload while developing, run `npm run dev` and load `dist/` the same way.

## Checks

| Command | What it runs |
|---|---|
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) |
| `npm run e2e` | Builds, then Playwright loads `dist/` into Chromium and drives it |
| `npm run check` | All three |

First run of the e2e tests needs `npx playwright install chromium`.

## Branding

KR palette: `#FFF200` yellow on black, tight corner radius, from Keith's KR GitHub mark. The UI has
two color schemes (Settings → Appearance): **KR** (default) and **Terracotta**, each in light
and dark.

Icon concepts live in `branding/icons/*.svg`. `node branding/render.mjs` renders them and a
comparison sheet (`branding/preview/sheet.png`, 128/32/16 px on dark and light);
`node branding/render.mjs --ship <name>` writes the chosen one to `public/icons/`.
`node branding/screenshots.mjs` (after `npm run build`) captures the UI in every scheme.
The original terracotta icon script is `scripts/make-icons.py`.
