import { db } from './db/db';
import { omniboxSuggestions, resolveOmnibox } from './omnibox';
import { runSync } from './sync/runner';
import { AUTO_KEY, SKIPPED_KEY, UPDATE_KEY, checkIfDue, currentNotice } from './update/update';

const ALARM = 'mingtab-sync';

// The toolbar button opens the side panel, or a popup (Settings → Toolbar button).
const ACTION_MODE = 'mingtab.actionMode';
async function applyActionMode() {
  const mode = ((await chrome.storage.local.get(ACTION_MODE))[ACTION_MODE] as string | undefined) ?? 'panel';
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: mode !== 'popup' });
  await chrome.action.setPopup({ popup: mode === 'popup' ? 'src/sidepanel/index.html?popup=1' : '' });
}
chrome.runtime.onInstalled.addListener(() => void applyActionMode().catch(console.error));
chrome.runtime.onStartup.addListener(() => void applyActionMode().catch(console.error));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[ACTION_MODE]) void applyActionMode();
});

// "to …" in the address bar.
const BOARD = chrome.runtime.getURL('src/newtab/index.html');
chrome.omnibox.setDefaultSuggestion({ description: 'MingTab: open a shortcut, or search your saved tabs' });
chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  omniboxSuggestions(db, text).then(suggest, console.error);
});
chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const url = await resolveOmnibox(db, text, BOARD);
  if (disposition === 'currentTab') await chrome.tabs.update({ url });
  else await chrome.tabs.create({ url, active: disposition === 'newForegroundTab' });
});
// For tests: the same resolver the address bar uses.
(globalThis as { mingtab?: object }).mingtab = { resolveOmnibox: (text: string) => resolveOmnibox(db, text, BOARD) };

// Sync every minute, at startup, on request, and shortly after local edits.
const ensureAlarm = async () => {
  if (!(await chrome.alarms.get(ALARM))) await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
};
void ensureAlarm();
chrome.runtime.onStartup.addListener(() => void runSync());
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) {
    void runSync();
    // Cheap (reads the local manifest, no network): notices an unzipped update within a minute.
    void refreshUpdateBadge().catch(console.error);
  }
});

let soon: ReturnType<typeof setTimeout> | undefined;
chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, reply) => {
  if (msg?.type === 'mingtab:sync-now') {
    runSync().then(() => reply(true), () => reply(false));
    return true; // reply asynchronously
  }
  if (msg?.type === 'mingtab:sync-soon') {
    clearTimeout(soon);
    soon = setTimeout(() => void runSync({ onlyIfChanged: true }), 2000);
  }
  return false;
});

// Update notices: check GitHub Releases about once a day, and badge the toolbar
// button when a newer version is out or already unzipped and waiting for a restart.
const UPDATE_ALARM = 'mingtab-update';
async function refreshUpdateBadge() {
  const notice = await currentNotice();
  const text = notice.kind === 'none' ? '' : '↑';
  await chrome.action.setBadgeText({ text });
  if (text) {
    await chrome.action.setBadgeBackgroundColor({ color: '#C9A24A' });
    await chrome.action.setBadgeTextColor?.({ color: '#0E0D0B' });
  }
  await chrome.action.setTitle({
    title:
      notice.kind === 'restart'
        ? `MingTab ${notice.version} is ready: restart MingTab to finish updating`
        : notice.kind === 'available'
          ? `MingTab ${notice.release.version} is available`
          : 'Open MingTab',
  });
}
const updateTick = () => void checkIfDue().then(refreshUpdateBadge).catch(console.error);
void (async () => {
  if (!(await chrome.alarms.get(UPDATE_ALARM))) await chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 60 });
})();
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === UPDATE_ALARM) updateTick();
});
chrome.runtime.onStartup.addListener(updateTick);
chrome.runtime.onInstalled.addListener(updateTick);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[UPDATE_KEY] || changes[SKIPPED_KEY] || changes[AUTO_KEY])) {
    void refreshUpdateBadge().catch(console.error);
  }
});
