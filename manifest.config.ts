import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'MingTab',
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
  chrome_url_overrides: {
    newtab: 'src/newtab/index.html',
  },
  permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'tabs', 'tabGroups', 'favicon'],
  // Requested only when history search is turned on in Settings.
  optional_permissions: ['history'],
});
