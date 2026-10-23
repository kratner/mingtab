import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Builds dist-test/ and starts a local sync server (see e2e/global-setup.ts).
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  // Each test launches its own Chromium with the extension loaded, so keep
  // them serial to avoid profile contention.
  workers: 1,
  reporter: 'list',
});
