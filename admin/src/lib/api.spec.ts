import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DescribedController } from './api';
import { API_URL, ApiError, api, labelOf, sectionsOf } from './api';
import { storeToken, token } from './session';

function answering(
  status: number,
  body: unknown = { data: null, messages: [] },
) {
  return vi.fn(() =>
    Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body),
    }),
  );
}

function lastRequest(sent: ReturnType<typeof answering>): {
  url: string;
  headers: Headers;
  init: RequestInit;
} {
  const call = sent.mock.calls.at(-1) as unknown as [string, RequestInit];

  return {
    url: call[0],
    headers: call[1].headers as Headers,
    init: call[1],
  };
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

describe('the api client', () => {
  it('sends the call to the configured api, not to the admin origin', async () => {
    const sent = answering(200);
    vi.stubGlobal('fetch', sent);

    await api('/blog-posts');

    expect(lastRequest(sent).url).toBe(API_URL + '/blog-posts');
  });

  it('falls back to localhost when no api url is configured', () => {
    expect(API_URL).toBe('http://localhost:3000');
  });

  it('attaches the stored token as a bearer', async () => {
    const sent = answering(200);
    vi.stubGlobal('fetch', sent);
    storeToken('abc.def');

    await api('/blog-posts');

    expect(lastRequest(sent).headers.get('Authorization')).toBe(
      'Bearer abc.def',
    );
  });

  // Signed out, the header still goes out with an empty credential rather than
  // being omitted: the api answers 401, which is the branch below that clears
  // the session -- omitting the header would make an anonymous call look like
  // a malformed one instead. Headers trims the trailing space away, so what
  // actually leaves is the bare scheme.
  it('sends an empty bearer when nobody is signed in', async () => {
    const sent = answering(200);
    vi.stubGlobal('fetch', sent);

    await api('/blog-posts');

    expect(lastRequest(sent).headers.get('Authorization')).toBe('Bearer');
  });

  it('defaults the content type to json', async () => {
    const sent = answering(200);
    vi.stubGlobal('fetch', sent);

    await api('/blog-posts');

    expect(lastRequest(sent).headers.get('Content-Type')).toBe(
      'application/json',
    );
  });

  it('leaves a content type the caller chose alone', async () => {
    const sent = answering(200);
    vi.stubGlobal('fetch', sent);

    await api('/upload', { headers: { 'Content-Type': 'text/csv' } });

    expect(lastRequest(sent).headers.get('Content-Type')).toBe('text/csv');
  });

  it('leaves an authorization the caller chose alone', async () => {
    const sent = answering(200);
    vi.stubGlobal('fetch', sent);
    storeToken('stored');

    await api('/blog-posts', { headers: { Authorization: 'Bearer chosen' } });

    expect(lastRequest(sent).headers.get('Authorization')).toBe(
      'Bearer chosen',
    );
  });

  // The reason the client builds a Headers instead of spreading into an object
  // literal. HeadersInit is also a Headers or an array of pairs, and spreading
  // either of those yields an empty object -- so the headers a caller passed
  // would vanish with no error at all. These two cases are the whole point of
  // that line.
  it('keeps caller headers passed as a Headers instance', async () => {
    const sent = answering(200);
    vi.stubGlobal('fetch', sent);

    await api('/blog-posts', { headers: new Headers({ 'X-Probe': 'kept' }) });

    expect(lastRequest(sent).headers.get('X-Probe')).toBe('kept');
  });

  it('keeps caller headers passed as an array of pairs', async () => {
    const sent = answering(200);
    vi.stubGlobal('fetch', sent);

    await api('/blog-posts', { headers: [['X-Probe', 'kept']] });

    expect(lastRequest(sent).headers.get('X-Probe')).toBe('kept');
  });

  it('forwards the rest of the request untouched', async () => {
    const sent = answering(200);
    vi.stubGlobal('fetch', sent);

    await api('/blog-posts/search', { method: 'POST', body: '{"search":{}}' });

    const request = lastRequest(sent);
    expect(request.init.method).toBe('POST');
    expect(request.init.body).toBe('{"search":{}}');
  });

  it('returns the envelope the api answered with', async () => {
    vi.stubGlobal(
      'fetch',
      answering(200, { data: [{ id: 1 }], messages: ['ok'] }),
    );

    await expect(api('/blog-posts')).resolves.toEqual({
      data: [{ id: 1 }],
      messages: ['ok'],
    });
  });

  it('raises the status it was refused with', async () => {
    vi.stubGlobal('fetch', answering(500));

    await expect(api('/blog-posts')).rejects.toMatchObject({
      status: 500,
      message: 'Request to /blog-posts failed',
    });
  });

  it('raises an ApiError rather than a bare Error', async () => {
    vi.stubGlobal('fetch', answering(403));

    await expect(api('/blog-posts')).rejects.toBeInstanceOf(ApiError);
  });

  describe('when the session has expired', () => {
    it('drops the stale token instead of retrying with it', async () => {
      vi.stubGlobal('fetch', answering(401));
      storeToken('stale');

      await expect(api('/blog-posts')).rejects.toThrow('Session expired');
      expect(token()).toBeNull();
    });

    it('sends the caller back to the form', async () => {
      vi.stubGlobal('fetch', answering(401));
      storeToken('stale');

      await expect(api('/blog-posts')).rejects.toThrow('Session expired');
      expect(window.location.href).toBe('/login');
    });

    it('reports 401 so a page can tell it apart from a real failure', async () => {
      vi.stubGlobal('fetch', answering(401));

      await expect(api('/blog-posts')).rejects.toMatchObject({ status: 401 });
    });
  });
});

describe('route labels', () => {
  it('titles a single segment', () => {
    expect(labelOf('/seeders')).toBe('Seeders');
  });

  it('joins nested segments', () => {
    expect(labelOf('/inspector/requests')).toBe('Inspector Requests');
  });

  it('splits a kebab-cased segment into words', () => {
    expect(labelOf('/feature-flags')).toBe('Feature Flags');
  });

  it('splits kebab case inside a nested segment', () => {
    expect(labelOf('/audit-logs/verify')).toBe('Audit Logs Verify');
  });

  it('has nothing to say about the root', () => {
    expect(labelOf('/')).toBe('');
  });
});

function controller(
  basePath: string,
  routes: [string, string][],
): DescribedController {
  return {
    name: basePath + 'Controller',
    basePath,
    routes: routes.map(([method, path]) => ({
      method,
      path,
      handler: 'handle',
    })),
  };
}

// Nothing registers a section: installing a module that ships a listable route
// is what puts it in the sidebar. That makes this function the whole contract
// between a module and the admin nav, and a route wrongly kept or wrongly
// dropped here is a page that appears or vanishes with no error anywhere.
describe('section discovery', () => {
  it('lists a plain get route', () => {
    expect(sectionsOf([controller('/seeders', [['GET', '/']])])).toEqual([
      { label: 'Seeders', path: '/seeders', method: 'GET' },
    ]);
  });

  it('joins a nested get route onto its base path', () => {
    expect(
      sectionsOf([controller('/inspector', [['GET', '/requests']])]),
    ).toEqual([
      {
        label: 'Inspector Requests',
        path: '/inspector/requests',
        method: 'GET',
      },
    ]);
  });

  // A route taking an argument is a detail view, not something the nav can
  // link to without inventing an id.
  it('skips a get route that takes an argument', () => {
    expect(sectionsOf([controller('/blog-posts', [['GET', '/:id']])])).toEqual(
      [],
    );
  });

  // The Lomkit-style search contract takes its query in the body, so a
  // listable resource can show up as a POST and nothing else.
  it('lists a search route posted to', () => {
    expect(
      sectionsOf([controller('/blog-posts', [['POST', '/search']])]),
    ).toEqual([
      { label: 'Blog Posts', path: '/blog-posts/search', method: 'POST' },
    ]);
  });

  it('skips a post route that is not a search', () => {
    expect(
      sectionsOf([controller('/blog-posts', [['POST', '/publish']])]),
    ).toEqual([]);
  });

  // The last one is the pathless root controller: the introspection service
  // normalises an empty path to "/", which is why the hidden list carries "/"
  // and not "". A basePath of "" never reaches this function.
  it('skips the routes the overview already reports', () => {
    expect(
      sectionsOf([
        controller('/health', [['GET', '/']]),
        controller('/metrics', [['GET', '/']]),
        controller('/introspect', [['GET', '/']]),
        controller('/expose', [['GET', '/']]),
        controller('/', [['GET', '/']]),
      ]),
    ).toEqual([]);
  });

  it('skips the traces route, which has a page of its own', () => {
    expect(sectionsOf([controller('/pipeline', [['GET', '/traces']])])).toEqual(
      [],
    );
  });

  it('skips a describe route, whatever resource it hangs off', () => {
    expect(
      sectionsOf([controller('/blog-posts', [['GET', '/describe']])]),
    ).toEqual([]);
  });

  it('keeps every listable route of a controller that mixes them', () => {
    expect(
      sectionsOf([
        controller('/blog-posts', [
          ['GET', '/'],
          ['GET', '/:id'],
          ['POST', '/search'],
          ['GET', '/describe'],
          ['DELETE', '/:id'],
        ]),
      ]),
    ).toEqual([
      { label: 'Blog Posts', path: '/blog-posts', method: 'GET' },
      { label: 'Blog Posts', path: '/blog-posts/search', method: 'POST' },
    ]);
  });

  it('has nothing to show for no controllers', () => {
    expect(sectionsOf([])).toEqual([]);
  });
});
