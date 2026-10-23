# MingTab — Plan

A personal Toby replacement, built as a Chrome extension (Manifest V3).
Single user and local-first for now, with the data model ready for sync and sharing later.

Created 2026-10-22.

**Name:** MingTab, from *mingtang* (明堂, "bright hall"), the open, uncluttered space in front of a
building in feng shui, where qi gathers. A cleared tab bar is the bright hall; MingTab keeps it clear.

---

## 1. What Toby does (evaluated 2026-10-22)

Sources: the Chrome Web Store listing (Toby 2.0.0.15, updated 2026-10-20), gettoby.com/pricing,
and Keith's logged-in account on web.gettoby.com (read-only).

### Keith's data in Toby

| | |
|---|---|
| Orgs | 2: "Keith Ratner's organization" (1 space), "Keith ratner's Workspace" (7 spaces: How to Use Toby, Personal, Hobbies, Entertainment, Travel, Recipes, plus one with no name) |
| Collections | 86 (58 under "My Collections") |
| Cards | 454 (25 with a custom title, 22 with a note) |
| Duplicate URLs | 83 |
| Tags | 1 ("Digital Agency"), not used on any collection |
| Starred / public | 0 / 0 |

No collection has more than 20 cards, which may mean the web app only loaded part of the data.
**The importer must reconcile its count with a full export before we rely on it.**

### Toby's data model (from the web app's state)

```
team (org) ─┬─ groups (spaces)
            └─ lists (collections) { title, star, labelIds[], public, publicToken, position, groupId }
                 └─ cards { url, title, customTitle, customDescription (note), favIconUrl, position }
labels (tags) { title, color, position }
```

### Feature triage

| Toby feature | Toby tier | Our plan |
|---|---|---|
| Spaces → collections → cards | Free (60-card cap) | **M1**, no cap |
| Card notes / custom titles | Free | **M1** |
| Save the current window as a session (close tabs or keep them open) | Free | **M2** |
| Save a Chrome tab group with its color; restore it as a group | Free | **M2** |
| Open-tabs pane (all windows), drag a tab into a collection | Free | **M2** |
| Open one card / a whole collection; drop a collection onto open tabs | Free | **M2** |
| Drag and drop everything (cards, collections, merge collections) | Free | **M3** ✅ 2026-10-23. *Passed: 11 drop-logic unit tests + 9 e2e with real mouse drags (collection reorder + persist, keyboard reorder, card within/between collections, open tab → collection, collection → other space, click still opens link, merge, group/rename/recolor/ungroup, merge windows); plus layout e2e (no overflow at 320/400/768/1280). Awaiting Keith's check.* |
| Tab-group controls (group, rename, recolor, ungroup), merge windows | Free | **M3** |
| Side panel (Toby 2.0 default), new-tab override, toolbar popup | Free | **M1** side panel + new tab; popup later |
| Search across spaces, collections, cards and open tabs | Free | **M4** ✅ 2026-10-23. *Passed: search 0.33 ms/query over 5,000 cards (budget 50); duplicates on the real export: 80 exact, 87 normalized (the plan's 83 counted the 4 note cards' shared URL); 8 new e2e (search by title/URL/note, '/', jump-to-collection, open tabs, side panel, tags, starred, sort/expand/compact, dedupe with confirm). History search is opt-in and verified by hand only: Chrome's permission prompt can't be accepted in automated tests.* |
| Search browsing history | Paid | **M4** (`history` permission, opt-in) |
| Remove duplicates | Paid | **M4** (83 waiting) |
| Tags + tag filter, star, sort, views (list/grid), expand/collapse | Free | **M4** |
| Next (to-do queue of tabs) | Free | **M5** |
| To/Links (`to/docs` in the address bar) | Free | **M5** via `chrome.omnibox` keyword |
| Rich notes on the board (checklists, links) | Free | **M5** (Markdown-lite) |
| Themes, dark mode, color-blind palette | Free | **M1** dark/light, more later |
| Export collection (per-collection menu) | Free | **M1** JSON export/import |
| Accounts, sync across devices | Free | **Later** (phase 2) |
| Shared team spaces, invitations | Free/Team | **Later** (multiplayer) |
| Public share links (`gettoby.com/p/…`) | Free | **Later** (needs hosting) |
| Smart features: AI naming, sorting, grouping | Paid | **Later** (Claude API, opt-in) |
| SSO, billing, admin | Team | Skip |

---

## 2. Architecture

- **Manifest V3** extension: service worker plus one UI app, rendered in the side panel, the
  new-tab page (optional, toggled in settings) and later a popup.
- **Stack:** TypeScript, Vite, React, `@crxjs/vite-plugin` (hot reload of the unpacked
  extension), `dnd-kit` for drag and drop.
- **Storage:** IndexedDB through Dexie. It's local, unlimited with the `unlimitedStorage`
  permission, and supports indexed queries for search. `chrome.storage.local` holds settings only.
- **Permissions:** `tabs`, `tabGroups`, `sidePanel`, `storage`, `unlimitedStorage`, `favicon`;
  `history` is optional and requested only when history search is turned on. No host permissions:
  like Toby, we never read page content.
- **Favicons:** Chrome's `_favicon` API (`chrome-extension://<id>/_favicon/?pageUrl=…`), so no
  third-party favicon service. Toby's own service failed on most of Keith's cards during the
  evaluation.

### Data model (sync-ready from day one)

Every record has `id` (UUID), `createdAt`, `updatedAt` and `deletedAt` (tombstone, not hard
delete), plus a fractional-index `position` string. That way a sync server added later can merge
edits from two devices without renumbering everything.

```ts
Space      { id, name, position, color? }
Collection { id, spaceId, title, position, starred, tagIds[], collapsed, tabGroupColor? }
Card       { id, collectionId, url, title, customTitle?, note?, position }
Tag        { id, name, color }
NextItem   { id, cardId | url+title, position, doneAt? }
ToLink     { id, alias, url }          // to/<alias>
Settings   { theme, newTabOverride, closeTabsOnSave, ... }
```

### Multiplayer later (not built now)

Phase 2 sync: a small backend (Cloudflare Workers + D1, or a Durable Object per space) with
last-writer-wins per field, using `updatedAt` and the tombstones above. Shared spaces and public
share links come after that. The model above already supports it, so nothing has to be migrated.

---

## 3. Milestones and how each is verified

Every milestone is checked in two ways. **Vitest** unit tests cover the data layer (pure functions
plus `fake-indexeddb`). **Playwright** loads the unpacked extension into a real Chromium with a
persistent context and drives the side panel and new-tab pages. Before each milestone counts as
done, Keith also loads it unpacked in his own Chrome.

| # | Scope | Done when |
|---|---|---|
| **M0** ✅ 2026-10-22 | Scaffold: Vite + CRXJS + React + TS, manifest, side panel, new tab, Vitest + Playwright wired up | `npm run build` gives a loadable `dist/`; an e2e smoke test opens the side panel and sees the app. *Passed: typecheck, 2 unit, 3 e2e (side panel renders, new tab overridden, toolbar opens side panel). Awaiting Keith's load-unpacked check.* |
| **M1** ✅ 2026-10-22 | Spaces / collections / cards CRUD, notes, custom titles, dark/light theme, JSON export/import, **Toby import** | Import of Keith's Toby export shows 86 collections / 454 cards (or the export's true counts) with titles, notes and spaces intact; export → wipe → import round-trips identically. *Passed: 20 unit + 7 e2e. Real export: 86/454 in, 454 cards on the board and in IndexedDB; backup → delete a space → restore gives 454 again. Awaiting Keith's check.* |
| **M2** ✅ 2026-10-23 | Open-tabs pane, save window as session (close/keep), save + restore tab group with color, open card/collection | e2e: open 5 tabs → save → tabs closed → collection has 5 cards → restore → same 5 URLs open; tab group comes back in the same color. *Passed: 5 e2e against a local test site (save window → 5 tabs closed, 5 cards in order → Open all reopens the same 5 URLs; tab group → same title + color; keep-open setting; pinned excluded; single-tab save; side-panel switch). Awaiting Keith's check.* |
| **M3** | Drag and drop (tab → collection, card ↔ collection, reorder, merge collections), tab-group controls, merge windows | e2e drag tests; position strings stay ordered after 100 random moves (unit) |
| **M4** | Unified search (spaces, collections, cards, open tabs, opt-in history), tags + filter, star, sort, views, dedupe | Search for a known card returns it under 50 ms with 5,000 cards (unit benchmark); dedupe finds Keith's 83 duplicates and asks before removing any |
| **M5** | Next queue, To/Links omnibox keyword, rich notes, popup | Typing `to <alias>` in the address bar opens the saved URL (manual check, since Playwright can't drive the omnibox); Next survives a browser restart |
| **Later** | Sync, multiplayer spaces, share links, AI grouping | Planned separately when we get there |

---

## 4. Toby import

Preferred source: **Toby's own JSON export** (per-collection "Export" in the ⋮ menu; Toby also
offers a full-account export, still to be confirmed in the extension's settings). Fallback: a
one-off console script run on web.gettoby.com that reads the account through the same
`api2.gettoby.com/v2/states` call the web app uses (read-only, run by Keith).

The importer maps team → (prefix on the space name if more than one org), group → Space,
list → Collection, card → Card (`customTitle` → `customTitle`, `customDescription` → `note`),
label → Tag. It prints a reconciliation summary (expected counts vs imported counts) and never
merges into existing data without asking.

---

## 5. Open questions

1. **New-tab override on by default?** Toby 2.0 moved to the side panel by default. Proposal:
   side panel first, new-tab override as a setting.
2. **Chrome Web Store** publication, or keep it unpacked/private? Unpacked is enough for one user.
