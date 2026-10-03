import { describe, expect, it } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { firebaseVerifier } from '../src/auth.ts';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const keys = createLocalJWKSet({
  keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }],
});
const verify = firebaseVerifier('codetochip', keys);

const token = (claims: Record<string, unknown> = {}, project = 'codetochip', expires = '1h') =>
  new SignJWT({ firebase: { sign_in_provider: 'google.com' }, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject('user-1')
    .setIssuer(`https://securetoken.google.com/${project}`)
    .setAudience(project)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(privateKey);

describe('firebaseVerifier', () => {
  it('accepts a signed-in user', async () => {
    expect(await verify(await token())).toEqual({ uid: 'user-1' });
  });

  it('refuses guests, other projects, expired and junk tokens', async () => {
    expect(await verify(await token({ firebase: { sign_in_provider: 'anonymous' } }))).toBeNull();
    expect(await verify(await token({}, 'someone-else'))).toBeNull();
    expect(await verify(await token({}, 'codetochip', '-1 min'))).toBeNull();
    expect(await verify('not-a-token')).toBeNull();
  });
});
