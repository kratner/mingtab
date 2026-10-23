import { runSync } from './sync/runner';

const ALARM = 'mingtab-sync';

// Clicking the toolbar icon opens MingTab in the side panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

// Sync every minute, at startup, on request, and shortly after local edits.
const ensureAlarm = async () => {
  if (!(await chrome.alarms.get(ALARM))) await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
};
void ensureAlarm();
chrome.runtime.onStartup.addListener(() => void runSync());
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) void runSync();
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
