describe('WEBHOOK_ALLOW_PRIVATE_URLS outside devTools.environments', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.WEBHOOK_ALLOW_PRIVATE_URLS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.WEBHOOK_ALLOW_PRIVATE_URLS = originalFlag;
    jest.resetModules();
  });

  const load = (nodeEnv: string | undefined) => {
    if (nodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = nodeEnv;
    }
    process.env.WEBHOOK_ALLOW_PRIVATE_URLS = 'true';
    jest.resetModules();

    return () =>
      jest.isolateModules(() => {
        jest.requireActual('./outbound-webhook.env');
      });
  };

  it('is accepted in a listed environment', () => {
    expect(load('test')).not.toThrow();
  });

  it.each([
    ['unset', undefined],
    ['an unlisted demo', 'demo'],
  ])('stops the boot when NODE_ENV is %s', (_label, nodeEnv) => {
    expect(load(nodeEnv)).toThrow(/WEBHOOK_ALLOW_PRIVATE_URLS/);
  });
});
