import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { storeToken } from './session';

function answering() {
  return vi.fn(() =>
    Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ data: null, messages: [] }),
    }),
  );
}

function sentHeaders(sent: ReturnType<typeof answering>): Headers {
  const call = sent.mock.calls.at(-1) as unknown as [string, RequestInit];

  return call[1].headers as Headers;
}

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { href: '/' },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('tenant isolation', () => {
  it('names no tenant of its own: the tenant travels only inside the session token', async () => {
    const sent = answering();
    vi.stubGlobal('fetch', sent);
    storeToken('token-of-tenant-a');

    await api('/blog-posts/search', { method: 'POST' });

    const headers = sentHeaders(sent);
    const names = [...headers.keys()];

    expect(names.some((name) => name.includes('tenant'))).toBe(false);
    expect(headers.get('Authorization')).toBe('Bearer token-of-tenant-a');
  });

  it('switches tenant only by switching session, never by keeping the previous token', async () => {
    const sent = answering();
    vi.stubGlobal('fetch', sent);

    storeToken('token-of-tenant-a');
    await api('/blog-posts/search', { method: 'POST' });
    storeToken('token-of-tenant-b');
    await api('/blog-posts/search', { method: 'POST' });

    expect(sentHeaders(sent).get('Authorization')).toBe(
      'Bearer token-of-tenant-b',
    );
  });
});
