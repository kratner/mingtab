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

## Decisions (2026-10-23)

1. **Backend: A, Cloudflare Workers + D1** on keith.ratner@gmail.com's Cloudflare account.
2. **One shared MingTab** across work and personal Chrome profiles, with a per-device "Spaces on
   this device" filter (Settings).
3. **Sign-in: Google**, through Chrome's web-auth flow with Google's account chooser (not
   `getAuthToken`, which would use the work profile's own account). OAuth client "MingTab
   extension" in Google Cloud project `mingtab`, External / Testing, keith.ratner@gmail.com the
   only test user. The Worker also allows only that email (`ALLOWED_EMAILS`).
4. **Domain: none yet**; the Worker runs at `mingtab-sync.<subdomain>.workers.dev`.

## S1 as built (live 2026-10-23)

- `worker/`: the sync service. `POST /v1/auth/google` checks the Google ID token (signature
  against Google's keys, audience, expiry, verified email, allow list) and issues a per-device
  token (only its SHA-256 is stored). `POST /v1/sync` pushes up to 40 changes and returns
  changes since the device's cursor (pages of 500). Last writer wins per record by `updatedAt`.
- Extension: `src/sync/`. Background worker syncs every minute, at startup, on "Sync now", and
  about two seconds after a local edit. Import "replace" and backup restore now mark old records
  deleted instead of erasing them, so deletions reach other devices.
- Fixed extension ID `jclkedgbnlmbonoihhobgnmdoehmddpo` (manifest `key`; private key in
  git-ignored `.keys/`).
- Live: `https://mingtab-sync.mingtab-sync.workers.dev`. Keith's personal Chrome profile signed in and
  uploaded everything on 2026-10-23 (server: 4 spaces, 69 collections, 464 cards). Still to confirm:
  the work profile (or the PC) signs in and an edit crosses between them within a minute.
- Tests: Worker (11, real D1 in Miniflare), sync engine with two simulated devices (7), and two
  real Chromium profiles syncing through the Worker running locally (`e2e/sync.spec.ts`).
