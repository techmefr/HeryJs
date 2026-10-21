import { EmbeddingRequestFailedException } from './embedding-request-failed.exception';
import { OpenAiCompatibleEmbeddingDriver } from './openai-compatible-embedding.driver';
import { openAiEmbeddingsEnv } from './embeddings.env';

type Settings = ReturnType<typeof openAiEmbeddingsEnv>;

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    EMBEDDINGS_OPENAI_BASE_URL: 'https://embeddings.example.test/v1',
    EMBEDDINGS_OPENAI_API_KEY: undefined,
    EMBEDDINGS_OPENAI_MODEL: 'test-model',
    EMBEDDINGS_OPENAI_SEND_DIMENSIONS: false,
    EMBEDDINGS_OPENAI_TIMEOUT_MS: 1000,
    ...overrides,
  };
}

function sentBody(call: Parameters<typeof fetch> | undefined): unknown {
  const body = call?.[1]?.body;

  if (typeof body !== 'string') {
    throw new Error('the request carried no JSON body');
  }

  return JSON.parse(body);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OpenAiCompatibleEmbeddingDriver', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('posts the texts to /embeddings and returns the vectors in input order', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      }),
    );
    const driver = new OpenAiCompatibleEmbeddingDriver(
      settings({
        EMBEDDINGS_OPENAI_BASE_URL: 'http://localhost:11434/v1',
        EMBEDDINGS_OPENAI_API_KEY: 'sk-test',
        EMBEDDINGS_OPENAI_MODEL: 'nomic-embed-text',
      }),
    );

    const vectors = await driver.embed(['first', 'second']);

    expect(vectors).toEqual([
      [1, 0],
      [0, 1],
    ]);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('http://localhost:11434/v1/embeddings');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer sk-test' });
    expect(sentBody(fetchSpy.mock.calls[0])).toEqual({
      model: 'nomic-embed-text',
      input: ['first', 'second'],
    });
  });

  it('sends no authorization header when no key is configured', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ data: [{ index: 0, embedding: [1] }] }),
    );
    const driver = new OpenAiCompatibleEmbeddingDriver(settings());

    await driver.embed(['text']);

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect(init?.headers).not.toHaveProperty('authorization');
  });

  it('asks for the declared dimensions only when told to', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ data: [{ index: 0, embedding: [1] }] }),
    );
    const driver = new OpenAiCompatibleEmbeddingDriver(
      settings({ EMBEDDINGS_OPENAI_SEND_DIMENSIONS: true }),
    );

    await driver.embed(['text']);

    expect(sentBody(fetchSpy.mock.calls[0])).toMatchObject({
      dimensions: driver.dimensions,
    });
  });

  it('turns a non-2xx answer into a bad gateway without echoing the body', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: { message: 'secret detail' } }, 401),
    );
    const driver = new OpenAiCompatibleEmbeddingDriver(settings());

    const failure = driver.embed(['text']);

    await expect(failure).rejects.toThrow(EmbeddingRequestFailedException);
    await expect(failure).rejects.toThrow(/401/);
    await expect(failure).rejects.not.toThrow(/secret detail/);
  });

  it('rejects an answer that is not the embeddings shape', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ unexpected: true }));
    const driver = new OpenAiCompatibleEmbeddingDriver(settings());

    await expect(driver.embed(['text'])).rejects.toThrow(
      EmbeddingRequestFailedException,
    );
  });

  it('rejects an answer with fewer embeddings than texts', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ data: [{ index: 0, embedding: [1] }] }),
    );
    const driver = new OpenAiCompatibleEmbeddingDriver(settings());

    await expect(driver.embed(['one', 'two'])).rejects.toThrow(
      /1 embeddings for 2 texts/,
    );
  });

  it('drops a trailing slash from the configured base url', () => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      EMBEDDINGS_OPENAI_BASE_URL: 'http://localhost:11434/v1/',
    });

    expect(openAiEmbeddingsEnv().EMBEDDINGS_OPENAI_BASE_URL).toBe(
      'http://localhost:11434/v1',
    );

    jest.restoreAllMocks();
  });

  it('wraps a network failure', async () => {
    fetchSpy.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const driver = new OpenAiCompatibleEmbeddingDriver(settings());

    await expect(driver.embed(['text'])).rejects.toThrow(/ECONNREFUSED/);
  });
});
