# Changelog

What's new in each MingTab release. Downloads and install steps are on the
[Releases](https://github.com/kratner/mingtab/releases) page.

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

First release. A local-first replacement for Toby, as a Chrome extension:

- **Board:** spaces, collections and cards, with notes, custom titles, tags, stars, sorting, list and
  compact views, and a dark and light theme. Opens in the side panel and, optionally, on new tabs.
- **Open tabs:** save a window, a tab group (it reopens as a group in the same color) or a single tab;
  open a whole collection; group, rename, recolor and ungroup tabs; merge windows.
- **Drag and drop:** tabs into collections, cards between collections, collections between spaces, and
  one collection onto another to merge them.
- **Search** across spaces, collections, cards and open tabs, plus browsing history if you turn it on.
  **Duplicates** finds repeated cards and asks before removing any.
- **Next:** a queue of pages to get through. **Notes** with checklists and links.
- **Address-bar shortcuts:** type `to/` then a card's shortcut to open it (Toby's keyword).
- **Import** from Toby, plus JSON backup and restore.
- **Sync** across Chrome profiles and computers through a small Cloudflare Worker, with Google sign-in.
