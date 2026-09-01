import { describe, expect, it } from 'vitest';
import { shouldUseSecureCookies } from './auth.config';

/**
 * Which cookie the app issues is decided here, and getting it wrong issues an
 * unprotected session cookie for an application holding Title IX files about
 * minors — with nothing in the app reporting it. (SEC-28)
 */
describe('shouldUseSecureCookies', () => {
  it('is secure when the deployment declares https', () => {
    expect(shouldUseSecureCookies('https://generalschat.example.org')).toBe(true);
    expect(shouldUseSecureCookies('HTTPS://GeneralsChat.Example.Org')).toBe(true);
  });

  it('is not secure over plain http', () => {
    // The e2e suite runs a production build over http; a __Secure- cookie is
    // rejected outright there, which would break auth for a reason unrelated
    // to the code under test.
    expect(shouldUseSecureCookies('http://localhost:3100')).toBe(false);
  });

  it('is not secure when nothing is declared', () => {
    // Fails closed on the cookie name rather than issuing a __Secure- cookie
    // the browser will then refuse to store.
    expect(shouldUseSecureCookies(undefined)).toBe(false);
    expect(shouldUseSecureCookies('')).toBe(false);
    expect(shouldUseSecureCookies('   ')).toBe(false);
  });

  it('is not fooled by https appearing elsewhere in the value', () => {
    expect(shouldUseSecureCookies('http://example.org/?next=https://elsewhere')).toBe(false);
  });
});
