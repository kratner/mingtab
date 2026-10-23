# MingTab — Profiles, storage and sync (design, 2026-10-23)

Decision record for how MingTab gets from one Chrome on one Mac to every machine, every Chrome
profile and a phone. Nothing here is built yet; it's the plan for phase 2 in [PLAN.md](PLAN.md).

## Where data lives today

| What | Where | Survives |
|---|---|---|
| Spaces, collections, cards, tags | IndexedDB `mingtab`, inside the extension's origin, in **one Chrome profile on one machine** | Browser restarts, extension reloads and rebuilds. **Not** removing the extension, and not moving `dist/` to another folder (an unpacked extension's ID comes from its path). |
| UI prefs (theme, scheme, close-on-save, last space) | `localStorage` of the extension origin, same scope | Same |
| Backup | Manual: Settings → Download backup (JSON) | Wherever you put the file |

So today each Chrome profile on each machine is its own island, and the only safety net is the
manual backup.

## Constraints (checked 2026-10-23)

- **Chrome on phones runs no extensions.** Regular Chrome for Android/iOS has no extension
  support; the only work is an experimental "Desktop Android" build for large screens, with no
  phone release planned. Mobile therefore means a **web app (PWA)**, not the extension.
- **`chrome.storage.sync` is too small for the data**: 100 KB total, 8 KB per item, 512 items,
  120 writes/minute. Keith's 454 cards are well past that once titles, URLs and notes are counted.
  It's fine for small settings.
- **Unpacked extensions get an ID from their folder path**, so each machine gets a different ID.
  Anything that ties to the ID (OAuth redirect, `chrome.identity`) needs a fixed `key` in the
  manifest first.

## Profiles: the model

A **MingTab account** is separate from the Chrome profile. Each Chrome profile that has MingTab
installed signs in to an account, and every place signed in to the same account sees the same
spaces.

- Work profile (keith@entremax.media) and personal profile (gmail) can share one MingTab account
  or use two. **Recommendation: one account**, plus a per-device "show these spaces here"
  filter, so work spaces don't clutter the personal profile but nothing is ever stranded.
- Signing in is per profile, once. Until you sign in, MingTab keeps working locally exactly as
  now ("local-first"); signing in uploads what's there and merges.

## Sync options

All three use the sync metadata already on every record (UUID, `updatedAt`, `deletedAt`
tombstone, fractional `position`), so none needs a data migration. Conflicts resolve per record,
last writer wins by `updatedAt`. That's right for one person on several devices; real-time
co-editing by several people would need per-field merges later.

| | A. Own backend on Cloudflare (Workers + D1) | B. Dexie Cloud | C. Google Drive file (appDataFolder) |
|---|---|---|---|
| What it is | Small sync API we write: `push` changes, `pull` since a cursor. D1 (SQLite) stores records. Same Worker serves the mobile web app. | Hosted sync service made for Dexie, the database library MingTab already uses. Add-on handles auth, sync, offline. | The extension writes a JSON snapshot / change log to a hidden folder in your Google Drive. No server. |
| Cost | Free tier: 5 M rows read, 100 k rows written per day, 5 GB. One person won't come close. | Free: 3 production users, 100 MB. Paid pricing is inconsistent on their page (€0.12/user/month vs €3 per 25 seats); confirm before relying on it. | Free (your Drive quota). |
| Work to build | Most: API, auth, sync loop, tests. Roughly a milestone. | Least: mostly configuration; some schema adjustments for their ID rules. | Medium: OAuth app setup, snapshot merge logic. |
| Mobile | Web app on the same Worker, same API. | Web app with the same add-on. | Web app needs its own Google OAuth; merging whole-file snapshots from several writers gets fragile. |
| Multiplayer later | Yours to design (shared spaces, invites); full control. | Built in (sharing "realms", members, roles). | Poor: Drive files aren't a multi-user database. |
| Data ownership | Your Cloudflare account. | Their servers (Sweden); export available. | Your Google Drive. |
| Auth | Needs choosing: Google sign-in (OAuth) or passkeys or a magic link. | Theirs: email one-time code. | Google account. |

**Recommendation: A, Cloudflare Workers + D1.** You already use Cloudflare. It costs nothing at
this scale, keeps the data in your own account, gives the mobile web app a home on the same
domain, and leaves room for sharing a space with someone later without a vendor's sharing model.
B is the fast path if you'd rather have sync next week and accept a hosted dependency. C isn't
recommended: it doesn't grow into mobile or sharing.

## Mobile

- **Web app (PWA)** built from the same React code: board, search, open a card, add a link. The
  parts that drive Chrome (open-tabs pane, save window, tab groups, side panel) don't exist on a
  phone and are hidden.
- **Saving from the phone**: on Android, an installed PWA can be a target in the share sheet
  (Web Share Target), so "Share → MingTab" saves the page. iOS Safari doesn't support share
  targets for web apps; there, a Shortcut that posts the URL to the API is the workaround.
- Installed from the browser's "Add to Home Screen". No app store.

## Getting the extension onto other machines

- Today: clone the repo, `npm install && npm run build`, Load unpacked. Works, but each machine
  must rebuild by hand to update.
- Before sync: add a fixed `key` to the manifest so the extension ID is the same everywhere
  (needed for sign-in redirects).
- Later: publish to the Chrome Web Store as **unlisted** (only people with the link can find it).
  Chrome then auto-updates it on every machine and profile.

## Proposed sequence

1. **Start of S1:** stable extension ID (`key` in manifest). **This changes the ID once**, and
   IndexedDB belongs to the ID, so MingTab would look empty afterwards: download a backup first
   and restore it after. Do it deliberately, not as a side effect of another change.
2. **Sync milestone (S1):** Worker + D1 API, sign-in, background sync in the extension, both
   Chrome profiles on this Mac + the PC syncing. Done when: an edit on one machine shows on the
   other within a minute, and offline edits on both merge without loss.
3. **Mobile milestone (S2):** PWA on the same Worker; Android share target.
4. **Later:** unlisted Web Store listing; shared spaces.

## Open decisions for Keith

1. Sync backend: A (Cloudflare, recommended), B (Dexie Cloud) or C (Drive).
2. One MingTab account across work and personal Chrome profiles, with per-device space filters?
3. Sign-in method: Google sign-in, passkey, or email magic link.
4. Domain for the web app and API (e.g. a subdomain of a domain you already own on Cloudflare).
