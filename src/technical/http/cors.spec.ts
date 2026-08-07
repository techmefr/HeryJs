import {
  DEFAULT_CORS_ALLOWED_HEADERS,
  loadCorsConfig,
  resolveCorsOptions,
} from './cors';

describe('cors configuration', () => {
  it('sends no header when no origin is declared', () => {
    expect(resolveCorsOptions({ origins: [] }, 'production')).toBe(false);
    expect(resolveCorsOptions(null, 'development')).toBe(false);
  });

  it('refuses any origin in production', () => {
    expect(() => resolveCorsOptions({ origins: ['*'] }, 'production')).toThrow(
      /cors\.config\.ts/,
    );
  });

  it('allows any origin outside production', () => {
    expect(resolveCorsOptions({ origins: ['*'] }, 'development')).toMatchObject(
      {
        origin: '*',
        credentials: false,
      },
    );
  });

  it('refuses any origin together with credentials, which browsers reject', () => {
    expect(() =>
      resolveCorsOptions({ origins: ['*'], credentials: true }, 'development'),
    ).toThrow(/credentials/);
  });

  it('passes the declared origins through, and allows the Bearer header by default', () => {
    const options = resolveCorsOptions(
      { origins: ['https://app.example.com'], credentials: true },
      'production',
    );

    expect(options).toMatchObject({
      origin: ['https://app.example.com'],
      credentials: true,
      allowedHeaders: DEFAULT_CORS_ALLOWED_HEADERS,
    });
  });

  it('reads the file this repository ships, and it is one production refuses as it stands', () => {
    const config = loadCorsConfig();

    expect(config?.origins).toEqual(['*']);
    expect(resolveCorsOptions(config, 'development')).toMatchObject({
      origin: '*',
    });
    expect(() => resolveCorsOptions(config, 'production')).toThrow();
  });
});
