import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Each test launches its own Chromium with the extension loaded, so keep
  // them serial to avoid profile contention.
  workers: 1,
  reporter: 'list',
});
