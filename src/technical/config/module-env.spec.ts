import { z } from 'zod';
import { devOnlyDefault, parseModuleEnv } from './module-env';

describe('parseModuleEnv', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('falls back to the declared defaults outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.TEST_MODULE_SECRET;

    const parsed = parseModuleEnv('test', {
      TEST_MODULE_SECRET: devOnlyDefault('TEST_MODULE_SECRET', 'dev-value'),
    });

    expect(parsed.TEST_MODULE_SECRET).toBe('dev-value');
  });

  it('refuses the development default in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TEST_MODULE_SECRET;

    expect(() =>
      parseModuleEnv('test', {
        TEST_MODULE_SECRET: devOnlyDefault('TEST_MODULE_SECRET', 'dev-value'),
      }),
    ).toThrow(/TEST_MODULE_SECRET/);
  });

  it('accepts a real value in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.TEST_MODULE_SECRET = 'a-real-secret';

    const parsed = parseModuleEnv('test', {
      TEST_MODULE_SECRET: devOnlyDefault('TEST_MODULE_SECRET', 'dev-value'),
    });

    expect(parsed.TEST_MODULE_SECRET).toBe('a-real-secret');
  });

  it('names the module and the variable when a value is invalid', () => {
    process.env.TEST_MODULE_DRIVER = 'postgres';

    expect(() =>
      parseModuleEnv('storage', {
        TEST_MODULE_DRIVER: z.enum(['local', 's3']),
      }),
    ).toThrow(/storage module[\s\S]*TEST_MODULE_DRIVER/);
  });
});
