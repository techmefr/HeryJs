import type { Response } from 'express';
import { getAuthContext } from '#kernel/public/auth';
import { SessionOAuthLoginHandler } from './oauth-login.handler';
import type { OAuthLoginResult } from './oauth.types';

jest.mock('#kernel/public/auth', () => ({
  getAuthContext: jest.fn(),
}));

const RESULT: OAuthLoginResult = {
  outcome: 'signed-in',
  userId: 'user-1',
  provider: 'google',
  returnTo: '/home',
};

function mockSessionIssuer(createSession: jest.Mock): void {
  (getAuthContext as jest.Mock).mockResolvedValue({
    auth: { $context: Promise.resolve({ internalAdapter: { createSession } }) },
  });
}

function fakeResponse() {
  const headers: Record<string, string> = {};
  const state: { body: unknown } = { body: null };
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    json: (body: unknown) => {
      state.body = body;
    },
  } as unknown as Response;

  return { res, headers, state };
}

describe('SessionOAuthLoginHandler', () => {
  it('mints a session for the resolved user and returns its token uncached', async () => {
    const createSession = jest
      .fn()
      .mockResolvedValue({ token: 'session-token' });
    mockSessionIssuer(createSession);
    const { res, headers, state } = fakeResponse();

    await new SessionOAuthLoginHandler().handle(RESULT, res);

    expect(createSession).toHaveBeenCalledWith('user-1');
    expect(headers['cache-control']).toBe('no-store');
    expect(state.body).toMatchObject({
      data: { ...RESULT, token: 'session-token' },
    });
  });

  it('answers nothing when the session cannot be created', async () => {
    mockSessionIssuer(jest.fn().mockRejectedValue(new Error('db down')));
    const { res, state } = fakeResponse();

    await expect(
      new SessionOAuthLoginHandler().handle(RESULT, res),
    ).rejects.toThrow('db down');
    expect(state.body).toBeNull();
  });
});
