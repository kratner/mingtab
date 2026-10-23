import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Before the browser tests:
//  1. Build the extension into dist-test/ (never dist/, which Chrome loads day
//     to day), pointed at a local sync server.
//  2. Start the real sync Worker locally (wrangler dev) on a throwaway
//     database, trusting a throwaway signing key instead of Google's, so tests
//     can sign in without a Google account.
// The private half of that key is handed to tests via process.env.

export const SYNC_PORT = 8789;
const root = path.resolve(import.meta.dirname, '..');
const workerDir = path.join(root, 'worker');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

let wrangler: ChildProcess | undefined;
let stateDir: string | undefined;

async function waitFor(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Local sync server did not start at ${url}`);
}

export default async function globalSetup() {
  const syncUrl = `http://127.0.0.1:${SYNC_PORT}`;
  execFileSync(npx, ['vite', 'build', '--outDir', 'dist-test', '--emptyOutDir'], {
    cwd: root,
    env: { ...process.env, VITE_SYNC_URL: syncUrl, VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
    stdio: 'ignore',
  });

  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'e2e-key';
  const jwks = JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] });
  process.env.E2E_SYNC_URL = syncUrl;
  process.env.E2E_PRIVATE_JWK = JSON.stringify({ ...privateKey.export({ format: 'jwk' }), kid });

  stateDir = mkdtempSync(path.join(tmpdir(), 'mingtab-e2e-d1-'));
  execFileSync(npx, ['wrangler', 'd1', 'migrations', 'apply', 'mingtab', '--local', '--persist-to', stateDir], {
    cwd: workerDir,
    env: { ...process.env, CI: '1' },
    stdio: 'ignore',
  });
  wrangler = spawn(
    npx,
    ['wrangler', 'dev', '--port', String(SYNC_PORT), '--ip', '127.0.0.1', '--persist-to', stateDir, '--var', `TEST_JWKS:${jwks}`],
    { cwd: workerDir, env: { ...process.env, CI: '1' }, stdio: 'ignore' },
  );
  await waitFor(`${syncUrl}/`, 60_000);

  return async () => {
    wrangler?.kill();
    if (stateDir) rmSync(stateDir, { recursive: true, force: true });
  };
}
