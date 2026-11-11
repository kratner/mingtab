import { describe, expect, it } from 'vitest';
import { DRIVE_SCOPE } from '../config';
import { parseAuthResponse } from './auth';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const redirect = (params: Record<string, string>) =>
  `https://abc.chromiumapp.org/#${new URLSearchParams(params)}`;
const idToken = (email: string, nonce: string) => `${b64({ alg: 'RS256' })}.${b64({ email, nonce })}.sig`;

describe('Drive sign-in response', () => {
  it('reads the token, lifetime and email', () => {
    const r = parseAuthResponse(
      redirect({ access_token: 'at', expires_in: '3599', scope: `openid email ${DRIVE_SCOPE}`, id_token: idToken('a@b.c', 'n1') }),
      'n1',
    );
    expect(r).toEqual({ accessToken: 'at', expiresIn: 3599, email: 'a@b.c' });
  });

  it('refuses a response for another request', () => {
    expect(() =>
      parseAuthResponse(redirect({ access_token: 'at', scope: DRIVE_SCOPE, id_token: idToken('a@b.c', 'other') }), 'n1'),
    ).toThrow(/did not match/);
  });

  it('explains when the Drive box was unticked', () => {
    expect(() =>
      parseAuthResponse(redirect({ access_token: 'at', scope: 'openid email', id_token: idToken('a@b.c', 'n1') }), 'n1'),
    ).toThrow(/hidden folder/);
  });

  it('passes on Google errors', () => {
    expect(() => parseAuthResponse(redirect({ error: 'access_denied' }), 'n1')).toThrow(/cancelled/);
    expect(() => parseAuthResponse(redirect({ error: 'interaction_required' }), 'n1')).toThrow(/interaction_required/);
  });
});
