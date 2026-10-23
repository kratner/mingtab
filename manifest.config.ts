import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };
import sync from './sync.config.json' with { type: 'json' };

const syncOrigin = new URL(process.env.VITE_SYNC_URL || sync.syncUrl).origin;

export default defineManifest({
  manifest_version: 3,
  name: 'MingTab',
  // Public key that fixes the extension ID (sync.config.json → extensionId)
  // on every machine; Google sign-in redirects to that ID.
  key: sync.manifestKey,
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
  // "to docs" in the address bar opens the card with shortcut "docs".
  omnibox: { keyword: 'to' },
  chrome_url_overrides: {
    newtab: 'src/newtab/index.html',
  },
  permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'tabs', 'tabGroups', 'favicon', 'identity', 'alarms'],
  // Only the MingTab sync service.
  host_permissions: [`${syncOrigin}/*`],
  // Requested only when history search is turned on in Settings.
  optional_permissions: ['history'],
});
