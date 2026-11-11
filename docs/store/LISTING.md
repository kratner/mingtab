# Chrome Web Store listing

Everything the developer dashboard asks for, ready to paste, plus the steps around the upload.
The store zip comes from `npm run package:store` (`release/mingtab-<version>-store.zip`); images are
in this folder.

## Status

| Date | What happened |
|---|---|
| 2026-11-08 | Developer account created on keith.ratner@gmail.com ($5 paid). Publisher **Four Ounces**, contact email keith@fourounces.live (verified), **non-trader**. Publisher ID `5c1e66c1-20e2-4dba-918c-185d258c3a1a`. New accounts are limited to **2 items** for now. |
| 2026-11-08 | MingTab 0.11.0 (`mingtab-0.11.0-store.zip`) uploaded. Store ID **`ofeenikhemghdanmdfcjjmogniooejjd`**. Listing, privacy and distribution filled in as below; visibility **Unlisted**, free, all regions. |
| 2026-11-08 | Sync made ready for the store ID: OAuth redirect URI `https://ofeenikhemghdanmdfcjjmogniooejjd.chromiumapp.org/` added; Worker `ALLOWED_ORIGINS` updated and deployed (checked: the service answers the store origin). |
| 2026-11-08 | **Submitted for review.** Once it passes, it publishes (or, if staged, must be published within 30 days). |
| 2026-11-09 | **Approved and published** (Unlisted): <https://chromewebstore.google.com/detail/mingtab/ofeenikhemghdanmdfcjjmogniooejjd>, version 0.11.0 (store page "Updated November 9, 2026"; seen 2026-11-11). |

Promo video (Four Ounces YouTube channel, unlisted): <https://youtu.be/Gw_fAAaf64g>. **After approval:** Store listing → Global promo video → paste `https://www.youtube.com/watch?v=Gw_fAAaf64g`, save, submit. Built by `scripts/promo-video.mjs`.

**After approval, also:**

1. fourounces.live (four-ounces-brand repo, `site/index.html`, MingTab row): change the **Download** link from the
   GitHub release to the store page <https://chromewebstore.google.com/detail/ofeenikhemghdanmdfcjjmogniooejjd>
   (label it "Chrome Web Store"; keep GitHub), then `scripts/deploy-site.sh`.
2. README: add the store link above the GitHub install steps.
3. Video description: swap the GitHub link for the store URL; make the video and the MingTab playlist Public.
4. Add a row to the Status table above.

Dashboard: <https://chrome.google.com/webstore/devconsole/5c1e66c1-20e2-4dba-918c-185d258c3a1a/ofeenikhemghdanmdfcjjmogniooejjd/edit>
Store page once published: <https://chromewebstore.google.com/detail/ofeenikhemghdanmdfcjjmogniooejjd>

## Before the first upload

1. **Developer account.** Sign in at <https://chrome.google.com/webstore/devconsole> with your personal Google
   account (not a work one), accept the agreement and pay the one-time $5 fee. Set the publisher name to
   **Four Ounces** and the contact email to **keith@fourounces.live** (the dashboard sends a code there to
   verify it).
2. **Privacy policy page.** Publish `site/mingtab/privacy/` in the four-ounces-brand repo
   (`scripts/deploy-site.sh`), so <https://fourounces.live/mingtab/privacy/> is live before you submit.

## Upload and fill in

**Add new item** → upload `release/mingtab-<version>-store.zip`. The store gives MingTab a new ID, shown at the
top of the item's page. Then fill in each tab:

### Store listing

- **Description** (the summary line comes from the manifest: "A local-first tab manager for Chrome: save,
  organize and restore tabs."):

  > Keep your tab bar clear. MingTab saves your open tabs as collections, sorts them into spaces, and brings
  > them back when you need them. Everything stays on your computer.
  >
  > SAVE AND RESTORE
  > • Save a window, a tab group or a single tab as a collection. Saving closes the tabs, or keeps them open if
  >   you prefer.
  > • Save all keeps every window in one go; Open all puts each window back, tab groups included.
  > • A collection saved from a tab group reopens as a group with the same name and color.
  >
  > ORGANISE
  > • Spaces, collections and cards: drag to reorder, move cards between collections, tag, star, sort and merge.
  > • Select mode: tick cards anywhere, then make a new collection from them, move, copy, open or delete them.
  >   Every action can be undone.
  > • Stats: your biggest collections, most-saved sites, empty collections and duplicates. Remove extra copies in
  >   one click.
  >
  > FIND AND USE
  > • One search for everything you've saved, your open tabs and (if you turn it on) your browsing history.
  >   Press / from anywhere.
  > • A Next list for things to read, notes with checklists, and address-bar shortcuts: type "to/ docs" to open the
  >   card you named docs.
  > • See every open window and tab group; rename and recolor groups; merge all windows into one.
  > • The board opens on every new tab, and a side panel keeps it one click away.
  > • Light and dark themes.
  >
  > PRIVATE BY DESIGN
  > No ads, no analytics, no tracking. Your collections live in your browser. Back them up to a file whenever
  > you like.
  >
  > MingTab is made by Four Ounces: https://fourounces.live
  > MingTab is free. If it helps you, you can support it at ko-fi.com/fourounces.

- **Category:** Workflow & Planning (or Tools).
- **Language:** English.
- **Store icon:** 128×128 — `public/icons/icon-128.png`.
- **Screenshots** (1280×800, in this order): `screenshot-1-board-dark.png`, `screenshot-2-board-light.png`,
  `screenshot-3-search.png`, `screenshot-4-select.png`, `screenshot-5-stats.png`. Rebuild with
  `npm run build && node scripts/store-screenshots.mjs`.
- **Small promo tile** (440×280): `promo-small-440x280.png`.
- **Official URL / homepage:** https://fourounces.live — **Support URL:** https://github.com/kratner/mingtab/issues
- **Donations:** the description ends with "MingTab is free. If it helps you, you can support it at ko-fi.com/fourounces." (Ko-fi page renamed from ko-fi.com/deprogrammer on 2026-11-11; same account.)

### Privacy practices

- **Single purpose:** "MingTab is a tab manager: it saves the user's open tabs into collections, organises them,
  and reopens them."
- **Permission justifications:**

  | Permission | Justification |
  |---|---|
  | `tabs` | Lists the user's open tabs and windows so they can save them, and reopens saved tabs. |
  | `tabGroups` | Saves a tab group's name and color with a collection and recreates the group when it reopens; lets the user rename, recolor and merge groups. |
  | `storage` | Keeps settings and sync state. |
  | `unlimitedStorage` | Collections are stored locally (IndexedDB); large libraries can pass the default quota. |
  | `sidePanel` | Shows the user's collections in Chrome's side panel. |
  | `favicon` | Shows each saved page's icon from Chrome's local icon cache. |
  | `alarms` | Runs optional sync in the background once a minute. |
  | `identity` | Google sign-in for optional sync: email address, plus access to MingTab's own hidden app folder in the user's Google Drive (`drive.appdata`) when they choose Google Drive sync. |
  | `history` (optional) | Requested only if the user turns on history search; history is searched on the device and never stored or sent. |
  | Host permission `https://mingtab-sync.mingtab-sync.workers.dev/*` | The optional, invite-only MingTab sync server. |
  | Optional host permission `https://www.googleapis.com/*` | Requested only when the user turns on Google Drive sync: the Google Drive API, used to read and write MingTab's own files in the hidden app folder of the user's Drive. |
  | New tab override | The board is the extension's main page and opens on each new tab. |

- **Remote code:** No, MingTab doesn't use remote code.
- **Data usage**, tick: *Personally identifiable information* (email address, only when the user turns on sync)
  and *Website content* (the addresses and titles of tabs the user saves, synced only when the user turns sync
  on: to the user's own Google Drive app folder, or to the invite-only sync server). Leave the rest unticked. Certify all three: not sold, not used for unrelated purposes, not used for
  credit decisions.
- **Privacy policy URL:** https://fourounces.live/mingtab/privacy/

### Distribution

- **Visibility: start with Unlisted.** Only people with the link can install it. Google Drive sync works for
  anyone once the OAuth consent screen is **In production** with the `drive.appdata` scope (see SYNC.md →
  "Google Cloud setup"); until then only its test users can turn it on. The invite-only sync server still
  accepts only `ALLOWED_EMAILS`. Switch to Public after that.
- **Regions:** all.

## After the upload: make sync work with the new ID

The store copy has a different extension ID from the GitHub release (`jclkedgbnlmbonoihhobgnmdoehmddpo`), so
Google sign-in and the sync service must learn the new one:

1. Put the store ID in `sync.config.json` as `storeExtensionId` (for the record).
2. Google Cloud console (personal project) → APIs & Services → Credentials → MingTab's OAuth client →
   **Authorized redirect URIs** → add `https://<store-id>.chromiumapp.org/`.
3. `worker/wrangler.jsonc` → `ALLOWED_ORIGINS`: add `chrome-extension://<store-id>` (comma-separated), then
   deploy the Worker.

Then **Submit for review**. Reviews usually take a few days; broad permissions like `tabs` can take longer.

## Moving from the GitHub copy

The store copy starts empty. Sign in to sync, or in the old copy use **Settings → Backup → Download backup** and in the
store copy **Settings → Backup → Restore from backup**. Then remove the GitHub copy in `chrome://extensions` (it would
otherwise fight the store copy for the new tab page).

## Each new version

Bump the version as usual, then `npm run package:store` and upload the zip under **Package → Upload new
package**. The GitHub release (`npm run package`) carries on alongside it for other browsers.
