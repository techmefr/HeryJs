import { afterEach, describe, expect, it } from 'vitest';
import { clearToken, storeToken, token } from './session';

// The key is part of the contract, not an implementation detail: the login page
// writes it and every other page reads it back after a full reload, so renaming
// it would sign every open session out without a single failing type.
const KEY = 'heryjs-admin-token';

afterEach(() => {
  localStorage.clear();
});

describe('the admin session', () => {
  it('reports no token before anyone signs in', () => {
    expect(token()).toBeNull();
  });

  it('reads back the token it stored', () => {
    storeToken('abc.def');

    expect(token()).toBe('abc.def');
  });

  it('stores the token under the key the pages agree on', () => {
    storeToken('abc.def');

    expect(localStorage.getItem(KEY)).toBe('abc.def');
  });

  it('leaves nothing behind when it clears', () => {
    storeToken('abc.def');
    clearToken();

    expect(token()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('clears without complaint when there was nothing to clear', () => {
    expect(() => clearToken()).not.toThrow();
  });
});
