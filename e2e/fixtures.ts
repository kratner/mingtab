import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

// dist-test/ is built by global-setup.ts, pointed at the local sync server.
export const distDir = path.resolve(import.meta.dirname, '../dist-test');

/**
 * Which browser runs the tests: Playwright's Chromium by default, or another
 * Chromium-based browser via E2E_BROWSER=/path/to/its/executable (e.g. Vivaldi,
 * Edge, Brave) to check MingTab works there.
 */
export const launchOptions = () =>
  process.env.E2E_BROWSER
    ? { executablePath: process.env.E2E_BROWSER }
    : { channel: 'chromium' as const };

/** A fresh Chromium profile with MingTab loaded: one "device". */
export async function launchDevice() {
  const context = await chromium.launchPersistentContext('', {
    ...launchOptions(),
    args: [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  return { context, serviceWorker: worker, extensionId: new URL(worker.url()).host };
}

// Loads the built extension (dist-test/) into a fresh Chromium profile and exposes
// its id. Extensions need a persistent context; channel 'chromium' allows
// them to run headless.
//
// `site` is a local web server so tab tests don't depend on the network:
// GET /p/<name> returns a page titled "Page <name>".
export const test = base.extend<
  {
    context: BrowserContext;
    serviceWorker: Worker;
    extensionId: string;
  },
  { site: string }
>({
  site: [
    async ({}, use) => {
      const server = createServer((req, res) => {
        const name = decodeURIComponent((req.url ?? '').replace(/^\/p\//, ''));
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<!doctype html><title>Page ${name}</title><h1>Page ${name}</h1>`);
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
      server.close();
    },
    { scope: 'worker' },
  ],
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      ...launchOptions(),
      args: [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(worker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export const expect = test.expect;
