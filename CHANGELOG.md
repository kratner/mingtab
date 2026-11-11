# Changelog

What's new in each MingTab release. Downloads and install steps are on the
[Releases](https://github.com/kratner/mingtab/releases) page.

## Unreleased

### Added

- **Sync with Google Drive, for everyone.** Settings → Sync → **Sync with Google Drive** keeps MingTab the same
  in every Chrome profile and on every computer signed in to the same Google account. Your data goes in a hidden
  MingTab folder in your own Google Drive (Drive's app data folder, the only part of your Drive MingTab can
  see), one file per device, with no MingTab server in between. Edits made on two computers at the same time
  both survive; for the same item, the later edit wins. **Sign out** keeps your data; **Delete synced data**
  removes MingTab's files from Drive and turns sync off on every device. If Google sign-in lapses, Settings
  shows **Reconnect Google Drive**. Chrome asks for access to Google Drive only when you turn this on.
- The original MingTab sync server is still there for the accounts it was set up for (Settings → Sync →
  *Other ways to sync*), and a device on it can **Move to Google Drive**.

- **Support MingTab.** About now has a link to the Four Ounces page on Ko-fi (ko-fi.com/fourounces). MingTab stays
  free; tips are optional and don't unlock anything.

## 0.12.0 — 2026-11-11

### Added

- **Chrome Web Store build.** `npm run package:store` makes a zip for the store: no fixed extension ID, and no
  GitHub update checks or notices (the store updates MingTab itself). Listing text, screenshots and steps are
  in `docs/store/`.
- **Vivaldi:** setup steps in the README (the board opens on new tabs through Vivaldi's Homepage setting).
- **Drag handles on tabs.** Hover a saved tab or an open tab and a grip (⠿) appears left of its icon: drag it to
  another collection, or from the open tabs pane into a collection to save it. (Rows could already be dragged;
  the grip makes it visible.)
- **Drop line.** While you drag a tab, a line shows exactly where it will land: above or below the tab under the
  pointer (whichever half you're over), or at the end of a collection when you're over its header. It lands there.
  The other tabs no longer slide around while you drag. The line fades in and out as it moves, and it only
  appears where the drop would actually move the tab (not over the tab's own spot, or just above or below it).
  Dropping a tab on its own collection's header moves it to the end.

- **Edit a saved tab's address.** The edit form (✎) has an **Address** field; a bare domain like `imdb.com`
  gets `https://`.
- **Shortcuts in Vivaldi.** Vivaldi ignores extension address-bar keywords, so `to/` never worked there.
  Settings → Address-bar shortcuts now gives a search-engine address to add in Vivaldi (nickname `to`), with a
  Copy button; then `to docs` opens the shortcut. Behind it, opening the board at `#go=<shortcut>` jumps to
  that shortcut's page (or searches, if there's no such shortcut).

### Fixed

- The shortcut field's help text broke onto separate lines ("Shortcut: type / to/ / , Space, then…"). It now
  sits under the field as one sentence that uses the shortcut you're typing.

- Moving a saved tab with the keyboard (focus it, **Space**, arrow keys, **Space**) did nothing: the arrow keys
  stepped onto the tab's own collection instead of the next tab.
- Moving a tab within its own collection: the drop line could sit on the wrong tab (and over the tab's own spot
  or the gaps between tabs it jumped to the end of the collection), so the tab often didn't land where you aimed.


## 0.11.0 — 2026-10-31

### Added

- **Tab counts.** A space's header shows its tabs as well as its collections ("61 collections · 812 tabs"),
  and the bottom of the space list shows the totals across every space.
- **Stats.** A new view, under the totals, for spaces, collections, saved tabs, notes, empty collections and
  duplicate tabs (with a link to the duplicate finder), plus your biggest collections and most-saved sites.
  Spaces hidden on this device aren't counted. In the side panel, pick Stats from the space menu.
- **Select mode.** Select, in a space's header, in Starred or above search results, puts a checkbox on every
  card. A collection's header box ticks all its cards, shift-click ticks a range, and clicking a card's title
  ticks it instead of opening it. What you've ticked stays ticked as you switch spaces and search, so you can
  gather cards from anywhere. The bar along the bottom then does one of:
  - **New collection…**: name it and pick a space; move the cards there or copy them. It goes first in the space.
  - **Move to…** or **Copy to…** another collection, in any space.
  - **Open** them, or **Add to Next**.
  - **Delete** them.

  Moves, copies, new collections and deletes can be undone from the notice that follows. Esc or Done leaves
  select mode.

## 0.10.1 — 2026-10-31

### Changed

- **"A Four Ounces tool" links to fourounces.live.** The credit line at the bottom of About opens the Four Ounces
  site in a new tab.

## 0.10.0 — 2026-10-30

### Changed

- **Brand headlines.** The space name, collection titles and the Spaces and Open tabs labels are set in
  Archivo Black capitals, as on fourounces.live. Everything else stays in Inter. Hover a collection title
  to see it in full when it's cut short; renaming one still shows your text as you type it.
- **Red seal icon.** 明 in cream on vermilion, like a seal stamp, replacing the lacquer tile. It reads as
  red at 16 px and stands out in a dark tab strip, where the dark lacquer tile all but disappeared.
  The 明-in-a-doorway logo on the About page and welcome screen is a red seal to match: a cream doorway
  with 明 cut out in red.

## 0.9.0 — 2026-10-25

### New

- **Update notices.** MingTab checks for a new release about once a day. When one is out, the toolbar
  button shows ↑ and the board shows **Download**, **What's new** and **Skip this version**. After you
  unzip the new version over your MingTab folder, the notice changes to **Restart MingTab**: one click
  and the new version is running. **Settings → Updates** has **Check now** and a switch for the daily
  check. Install this release by hand once; after that, MingTab tells you about each new one.

### Changed

- **Icon on its own ground.** 明 stays in Old Gold, now on a lacquer-red tile instead of black, so MingTab is easy to
  pick out next to the other Four Ounces tools (Agent Workspace is indigo, Social Hub jade). The pixel-grid 16 px and
  32 px drawings are unchanged apart from the colour.

## 0.8.0 — 2026-10-25

### New

- **Four Ounces look.** MingTab now uses the Four Ounces studio brand: Old Gold on warm ink in dark mode
  and on warm paper in light mode, with Inter for text, Archivo Black for the MingTab name and JetBrains
  Mono for code. The fonts are bundled, so nothing loads from the web. It replaces the black-and-yellow
  KR scheme; if you had KR chosen, you get Four Ounces. Terracotta is still in **Settings**.
- **New icon.** 明 in Old Gold on the ink tile, drawn pixel by pixel at 16 px so it stays sharp in the
  toolbar. About now says "A Four Ounces tool".
- **Name a window as you save it.** **Save window** opens a name field with the dated name filled in and
  selected: press Enter to keep it, or type a new name.
- **Close a tab from the Open tabs pane.** Hover a tab and click ✕.
- **Every icon button has a tooltip**, including collapse, star, add a link and delete.

## 0.7.0 — 2026-10-23

### New

- **Save all windows in one click.** **Save all** in the Open tabs pane saves every window into one
  collection named "All windows <date, time>". The collection remembers which window and tab group each
  tab was in, the groups' names, colors and collapsed state, and each window's size, position and
  maximized state.
- **Reopen a whole session.** **Open all** on a collection saved this way opens one window per saved
  window, where it was on screen, with its tab groups rebuilt. The window you saved from comes to the
  front. Cards you add to the collection later open in the first window.
- With **Close tabs after saving** on, **Save all** closes the other windows outright and leaves the
  current window open with a new tab, instead of leaving an empty window behind for each one.

### Notes

- Pinned tabs and incognito windows aren't saved, the same as **Save window**.
- Full-screen windows reopen maximized.
- Collections saved before 0.7.0 open as before.

## 0.6.0 — 2026-10-23

First release. A local-first tab manager, as a Chrome extension:

- **Board:** spaces, collections and cards, with notes, custom titles, tags, stars, sorting, list and
  compact views, and a dark and light theme. Opens in the side panel and, optionally, on new tabs.
- **Open tabs:** save a window, a tab group (it reopens as a group in the same color) or a single tab;
  open a whole collection; group, rename, recolor and ungroup tabs; merge windows.
- **Drag and drop:** tabs into collections, cards between collections, collections between spaces, and
  one collection onto another to merge them.
- **Search** across spaces, collections, cards and open tabs, plus browsing history if you turn it on.
  **Duplicates** finds repeated cards and asks before removing any.
- **Next:** a queue of pages to get through. **Notes** with checklists and links.
- **Address-bar shortcuts:** type `to/` then a card's shortcut to open it.
- **Import** of existing collections, plus JSON backup and restore.
- **Sync** across Chrome profiles and computers through a small Cloudflare Worker, with Google sign-in.
