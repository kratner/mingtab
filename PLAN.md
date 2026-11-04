# MingTab — Plan

A personal tab manager, built as a Chrome extension (Manifest V3).
Single user and local-first for now, with the data model ready for sync and sharing later.

Created 2026-10-22.

**Name:** MingTab, from *mingtang* (明堂, "bright hall"), the open, uncluttered space in front of a
building in feng shui, where qi gathers. A cleared tab bar is the bright hall; MingTab keeps it clear.

---

## 1. Feature scope (2026-10-22)

| Feature | Our plan |
|---|---|
| Spaces → collections → cards | **M1** |
| Card notes / custom titles | **M1** |
| Save the current window as a session (close tabs or keep them open) | **M2** |
| Save a Chrome tab group with its color; restore it as a group | **M2** |
| Save all windows in one click, keeping windows (size, place, maximized) and tab groups | ✅ 2026-10-23. *Passed: snapshot/restore/close-plan unit tests + 1 e2e (2 windows, one grouped → one collection → windows reopen with the same tabs, group and position). Window size can't be checked in e2e (Playwright resizes pages it attaches to): Keith's check.* |
| Open-tabs pane (all windows), drag a tab into a collection | **M2** |
| Open one card / a whole collection; drop a collection onto open tabs | **M2** |
| Drag and drop everything (cards, collections, merge collections) | **M3** ✅ 2026-10-23. *Passed: 11 drop-logic unit tests + 9 e2e with real mouse drags (collection reorder + persist, keyboard reorder, card within/between collections, open tab → collection, collection → other space, click still opens link, merge, group/rename/recolor/ungroup, merge windows); plus layout e2e (no overflow at 320/400/768/1280). Awaiting Keith's check.* |
| Tab-group controls (group, rename, recolor, ungroup), merge windows | **M3** |
| Side panel, new-tab override, toolbar popup | **M1** side panel + new tab; popup later |
| Search across spaces, collections, cards and open tabs | **M4** ✅ 2026-10-23. *Passed: search 0.33 ms/query over 5,000 cards (budget 50); duplicates on the real export: 80 exact, 87 normalized (the plan's 83 counted the 4 note cards' shared URL); 8 new e2e (search by title/URL/note, '/', jump-to-collection, open tabs, side panel, tags, starred, sort/expand/compact, dedupe with confirm). History search is opt-in and verified by hand only: Chrome's permission prompt can't be accepted in automated tests.* |
| Search browsing history | **M4** (`history` permission, opt-in) |
| Remove duplicates | **M4** (83 waiting) |
| Tags + tag filter, star, sort, views (list/grid), expand/collapse | **M4** |
| Next (to-do queue of tabs) | **M5** ✅ 2026-10-23. *Passed: unit (Next queue, shortcuts, note format) + 4 e2e (notes with checklists, Next incl. drag and open tabs, shortcuts via the same resolver the address bar uses, popup setting) + Next syncing between two profiles. The address bar itself can't be driven by tests: first real `to …` is Keith's.* |
| Address-bar shortcuts (`to/docs`) | **M5** via `chrome.omnibox` keyword |
| Rich notes on the board (checklists, links) | **M5** (Markdown-lite) |
| Themes, dark mode, color-blind palette | **M1** dark/light, more later |
| Export collection (per-collection menu) | **M1** JSON export/import |
| Accounts, sync across devices | **Later** (phase 2) |
| Shared team spaces, invitations | **Later** (multiplayer) |
| Public share links | **Later** (needs hosting) |
| Smart features: AI naming, sorting, grouping | **Later** (Claude API, opt-in) |
| SSO, billing, admin | Skip |

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
  we never read page content.
- **Favicons:** Chrome's `_favicon` API (`chrome-extension://<id>/_favicon/?pageUrl=…`), so no
  third-party favicon service.

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
| **M1** ✅ 2026-10-22 | Spaces / collections / cards CRUD, notes, custom titles, dark/light theme, JSON export/import, import of existing collections | Importing Keith's existing collections shows 86 collections / 454 cards with titles, notes and spaces intact; export → wipe → import round-trips identically. *Passed: 20 unit + 7 e2e. Real export: 86/454 in, 454 cards on the board and in IndexedDB; backup → delete a space → restore gives 454 again. Awaiting Keith's check.* |
| **M2** ✅ 2026-10-23 | Open-tabs pane, save window as session (close/keep), save + restore tab group with color, open card/collection | e2e: open 5 tabs → save → tabs closed → collection has 5 cards → restore → same 5 URLs open; tab group comes back in the same color. *Passed: 5 e2e against a local test site (save window → 5 tabs closed, 5 cards in order → Open all reopens the same 5 URLs; tab group → same title + color; keep-open setting; pinned excluded; single-tab save; side-panel switch). Awaiting Keith's check.* |
| **M3** | Drag and drop (tab → collection, card ↔ collection, reorder, merge collections), tab-group controls, merge windows | e2e drag tests; position strings stay ordered after 100 random moves (unit) |
| **M4** | Unified search (spaces, collections, cards, open tabs, opt-in history), tags + filter, star, sort, views, dedupe | Search for a known card returns it under 50 ms with 5,000 cards (unit benchmark); dedupe finds Keith's 83 duplicates and asks before removing any |
| **M5** | Next queue, `to/` omnibox keyword, rich notes, popup | Typing `to <alias>` in the address bar opens the saved URL (manual check, since Playwright can't drive the omnibox); Next survives a browser restart |
| **Later** | Sync, multiplayer spaces, share links, AI grouping | Planned separately when we get there |

---

## 4. Open questions

1. **New-tab override on by default?** Proposal: side panel first, new-tab override as a setting.
2. **Chrome Web Store** publication, or keep it unpacked/private? Unpacked is enough for one user.
