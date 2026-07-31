import { loadHeryConfig } from './hery-config';

describe('loadHeryConfig', () => {
  it('reads and transpiles the real hery.config.ts at the project root', () => {
    const config = loadHeryConfig();

    expect(config.search?.default).toBe('prisma');
    expect(config.search?.engines.prisma).toEqual({ driver: 'prisma' });
  });
});
