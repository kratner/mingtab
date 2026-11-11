import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };
import sync from './sync.config.json' with { type: 'json' };

const syncOrigin = new URL(process.env.VITE_SYNC_URL || sync.syncUrl).origin;
// Google Drive sync talks to the Drive API. It's an *optional* host
// permission, asked for when someone turns Drive sync on, so installing or
// updating MingTab shows no new warning. Test builds point at a local fake
// Drive (VITE_DRIVE_URL) and grant it up front.
const testDriveOrigin = process.env.VITE_DRIVE_URL ? new URL(process.env.VITE_DRIVE_URL).origin : null;
// The Chrome Web Store build leaves out `key`: the store rejects it and gives
// MingTab its own ID (sync.config.json → storeExtensionId once it's known).
const store = process.env.VITE_STORE === '1';

export default defineManifest({
  manifest_version: 3,
  name: 'MingTab',
  // Public key that fixes the extension ID (sync.config.json → extensionId)
  // on every machine; Google sign-in redirects to that ID.
  ...(store ? {} : { key: sync.manifestKey }),
  description: pkg.description,
  version: pkg.version,
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'Open MingTab',
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  // "to/" then "docs" in the address bar opens the card with shortcut "docs".
  // Same keyword as Toby's To/Links, so the habit carries over (only one
  // extension can own it: turn Toby off).
  omnibox: { keyword: 'to/' },
  chrome_url_overrides: {
    newtab: 'src/newtab/index.html',
  },
  permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'tabs', 'tabGroups', 'favicon', 'identity', 'alarms'],
  // Only the MingTab sync server (invite only).
  host_permissions: [`${syncOrigin}/*`, ...(testDriveOrigin ? [`${testDriveOrigin}/*`] : [])],
  // Google Drive API, requested when Drive sync is turned on.
  optional_host_permissions: [`${testDriveOrigin ?? 'https://www.googleapis.com'}/*`],
  // Requested only when history search is turned on in Settings.
  optional_permissions: ['history'],
});
