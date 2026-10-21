import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import {
  MAX_BATCH_ENTRIES,
  capabilityKeysOf,
  chunked,
  failureMessages,
  isAllowed,
  messagesOfDetails,
  mutateIds,
  resourcesOf,
  summarize,
} from './resource';
import type { BatchEntry } from './resource';
import { mockControllers, mockDescription } from './resource.fixture';

function answering(status: number, body: unknown) {
  return vi.fn(() =>
    Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body),
    }),
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { href: '/' },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resource discovery', () => {
  it('recognises a controller that searches, describes and creates', () => {
    expect(resourcesOf(mockControllers)).toEqual([
      { base: '/blog-posts', label: 'Blog Posts' },
    ]);
  });

  it('leaves a controller without a describe route as a plain listing', () => {
    const [controller] = mockControllers;
    const stripped = {
      ...controller!,
      routes: controller!.routes.filter((route) => route.path !== '/describe'),
    };

    expect(resourcesOf([stripped])).toEqual([]);
  });
});

describe('the capabilities to ask for', () => {
  it('asks for update and delete, restore under a bin, and a pair per relation', () => {
    expect(capabilityKeysOf(mockDescription)).toEqual([
      'update',
      'delete',
      'restore',
      'attachTags',
      'detachTags',
    ]);
  });

  it('does not ask for restore on a resource without a bin', () => {
    expect(
      capabilityKeysOf({
        ...mockDescription,
        softDeletes: false,
        relations: [],
      }),
    ).toEqual(['update', 'delete']);
  });

  it('treats a missing decision as a refusal', () => {
    expect(isAllowed(undefined, 'update')).toBe(false);
    expect(isAllowed({ update: { allowed: false } }, 'update')).toBe(false);
    expect(isAllowed({}, 'update')).toBe(false);
    expect(isAllowed({ update: { allowed: true } }, 'update')).toBe(true);
  });
});

describe('batches', () => {
  it('cuts a list into chunks of the given size', () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunked([], 2)).toEqual([]);
  });

  it('splits more ids than a batch may carry across requests', async () => {
    const sent = answering(201, { data: [], messages: [] });
    vi.stubGlobal('fetch', sent);
    const ids = Array.from(
      { length: MAX_BATCH_ENTRIES + 1 },
      (_, i) => 'id-' + i,
    );

    await mutateIds('/blog-posts', 'delete', ids);

    expect(sent).toHaveBeenCalledTimes(2);
    const bodies = sent.mock.calls.map(
      (call) =>
        JSON.parse(
          (call as unknown as [string, RequestInit])[1].body as string,
        ) as { ids: string[] },
    );
    expect(bodies[0]!.ids).toHaveLength(MAX_BATCH_ENTRIES);
    expect(bodies[1]!.ids).toEqual(['id-100']);
  });

  it('keeps going when one chunk fails and marks its ids refused', async () => {
    const ok = {
      status: 201,
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ index: 0, id: 'id-0', status: 'ok', data: null }],
          messages: [],
        }),
    };
    const refused = {
      status: 403,
      ok: false,
      json: () =>
        Promise.resolve({ error: { message: 'No hard delete for you' } }),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(ok).mockResolvedValueOnce(refused),
    );
    const ids = Array.from(
      { length: MAX_BATCH_ENTRIES + 1 },
      (_, i) => 'id-' + i,
    );

    const summary = summarize(await mutateIds('/blog-posts', 'delete', ids));

    expect(summary.succeeded).toEqual(['id-0']);
    expect(summary.failed).toEqual([
      { id: 'id-100', message: 'No hard delete for you' },
    ]);
  });

  it('summarises successes and per record refusals together', () => {
    const entries: BatchEntry[] = [
      { index: 0, id: 'a', status: 'ok', data: null },
      {
        index: 1,
        id: 'b',
        status: 'error',
        error: {
          status: 403,
          key: 'capability.forbidden',
          message: 'Forbidden',
        },
      },
      {
        index: 2,
        status: 'error',
        error: { status: 400, key: 'x', message: 'Bad' },
      },
    ];

    expect(summarize(entries)).toEqual({
      succeeded: ['a'],
      failed: [
        { id: 'b', message: 'Forbidden' },
        { id: 'entry 2', message: 'Bad' },
      ],
    });
  });
});

describe('failure messages', () => {
  it('reads the flattened validation errors a 400 carries', () => {
    expect(
      messagesOfDetails({
        formErrors: ['Top level'],
        fieldErrors: { data: ['Too small'], title: ['Required'] },
      }),
    ).toEqual(['Top level', 'Too small', 'title: Required']);
  });

  it('ignores details that are not a validation report', () => {
    expect(messagesOfDetails(null)).toEqual([]);
    expect(messagesOfDetails('text')).toEqual([]);
    expect(messagesOfDetails({ fieldErrors: { a: 'not a list' } })).toEqual([]);
  });

  it('prefers the validation report over the generic message', () => {
    const error = new ApiError('failed', 400, { formErrors: ['Nope'] }, 'Bad');

    expect(failureMessages(error)).toEqual(['Nope']);
  });

  it('falls back to what the api said, then to a plain sentence', () => {
    expect(
      failureMessages(new ApiError('failed', 403, null, 'Denied')),
    ).toEqual(['Denied']);
    expect(failureMessages(new ApiError('failed', 500))).toEqual([
      'The API refused the request.',
    ]);
    expect(failureMessages(new TypeError('offline'))).toEqual([
      'The request could not be sent.',
    ]);
  });
});
