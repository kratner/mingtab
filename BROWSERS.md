# MingTab in other browsers (2026-10-23)

MingTab is a Manifest V3 Chrome extension. Most other desktop browsers are built on Chromium and
load the same zip; Firefox and Safari need their own builds; phones need the web app.

**Legend:** ✅ tested here · 🟡 expected to work from the browser's documentation, not yet
tested · ❓ unknown · ❌ not available

## Chromium-based: same zip, "Load unpacked"

| | Chrome | Edge | Brave | Vivaldi | Opera / Arc |
|---|---|---|---|---|---|
| Install the release zip (developer mode) | ✅ | 🟡 `edge://extensions` | 🟡 `brave://extensions` | 🟡 `vivaldi://extensions` | ❓ |
| Board on new tab | ✅ | 🟡 | 🟡 | 🟡 | ❓ |
| Side panel | ✅ | 🟡 | 🟡 | 🟡 Vivaldi says it supports the Side Panel API (shown as a Web Panel); otherwise use **Settings → Toolbar button → popup** | ❓ |
| Save windows, open tabs pane | ✅ | 🟡 | 🟡 | 🟡 | ❓ |
| Tab groups (save/restore with color) | ✅ | 🟡 | 🟡 | ❓ Vivaldi has its own tab stacks | ❓ |
| Google sign-in for sync | ✅ | 🟡 | ❓ Brave limits Google sign-in features; untested | 🟡 | ❓ |
| `to/` address-bar keyword | ✅ | 🟡 | 🟡 | ❓ | ❓ |

**Why the zip carries over:** these browsers run Chrome's extension APIs. The manifest `key`
gives MingTab the same ID everywhere, so Google sign-in redirects to the same address and the
same Google client works without changes.

**Automated testing:** the browser tests can run in another Chromium browser with
`E2E_BROWSER=/path/to/executable npx playwright test`. Vivaldi didn't start under Playwright's
remote control (tried 2026-10-23, both headless modes), so Vivaldi needs a hand test. Edge and
Brave aren't installed on Keith's Mac yet.

**To try one:** download the release zip, unzip it, open the browser's extensions page, turn on
developer mode, Load unpacked, then sign in under Settings → Sync. If something on the list above
fails, the popup setting is the fallback for missing side panels.

## Firefox: a port (1–2 days)

Firefox supports MV3 and most of what MingTab uses, with these differences:

| MingTab uses | Firefox | Work |
|---|---|---|
| `sidePanel` | `sidebar_action` (Firefox's own sidebar) | Second manifest; the sidebar page is the same app |
| Background service worker | MV3 background **scripts** (event page) | Build setting |
| Tab groups | Added in Firefox 138 (`tabs.group`, `groupId`), Tab Groups API from 139 per Mozilla | Check colors/titles; otherwise skip group restore |
| `favicon` permission (`_favicon/`) | Not available | Use the icon saved with each card (already the fallback) |
| Google sign-in | `identity.launchWebAuthFlow` works; redirect is `https://<id>.extensions.allizom.org/` | Add that redirect to the Google client |
| Install | Must be signed by Mozilla to stay installed (unlisted signing is free) | Upload to addons.mozilla.org as unlisted |

Recommendation: a separate Firefox build target (manifest differences only; the app code is
shared), when Firefox is a browser Keith actually uses day to day.

## Safari: not recommended now

Needs Xcode to wrap the extension as a Mac app, an Apple developer account to sign it, and has
no side panel. Revisit if Safari becomes a daily browser.

## Phones

Chrome, Safari and Firefox on phones don't run desktop extensions. The plan is the web app (S2 in
[SYNC.md](SYNC.md)) on the same sync service.

## Sources

- Vivaldi: "Use your favorite extensions in Web Panels" (vivaldi.com/new) and the forum thread
  "Sidebar / Side Panel Extension API" (forum.vivaldi.net/topic/27343).
- Firefox tab groups: Mozilla Add-ons blog, "WebExtensions Support for Tab Groups" (2025-04-30),
  and Mozilla Discourse "Tab group support in Firefox 138".
- `identity.launchWebAuthFlow`: MDN WebExtensions reference.
