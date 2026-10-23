import { generateKeyPairSync } from 'node:crypto';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Tests sign their own Google-style ID tokens with this throwaway key; the
// Worker under test trusts only its public half (TEST_JWKS). Production never
// sets TEST_JWKS and uses Google's published keys.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'test-key';
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
const privateJwk = { ...privateKey.export({ format: 'jwk' }), kid, alg: 'RS256' };

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations('./migrations'),
          TEST_JWKS: JSON.stringify({ keys: [publicJwk] }),
          TEST_PRIVATE_JWK: JSON.stringify(privateJwk),
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
}));
