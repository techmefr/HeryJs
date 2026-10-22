import { assertHeryConfigChoices, loadHeryConfig } from './hery-config';
import type { HeryConfig } from './hery-config.types';

describe('loadHeryConfig', () => {
  it('reads and transpiles the real hery.config.ts at the project root', () => {
    const config = loadHeryConfig();

    expect(config.search?.default).toBe('prisma');
    expect(config.search?.engines.prisma).toEqual({ driver: 'prisma' });
  });
});

describe('assertHeryConfigChoices', () => {
  it('accepts every declared value and an absent one', () => {
    expect(() => assertHeryConfigChoices({})).not.toThrow();
    expect(() =>
      assertHeryConfigChoices({
        sharing: { onGrantorErasure: 'keep' },
        admin: { studioAccess: 'tenant-admin' },
      }),
    ).not.toThrow();
    expect(() =>
      assertHeryConfigChoices({
        sharing: { onGrantorErasure: 'revoke' },
        admin: { studioAccess: 'operator' },
      }),
    ).not.toThrow();
  });

  it('stops the boot on a value outside the choices, naming the key', () => {
    const config = {
      sharing: { onGrantorErasure: 'archive' },
      admin: { studioAccess: 'everyone' },
    } as unknown as HeryConfig;

    expect(() => assertHeryConfigChoices(config)).toThrow(
      /sharing\.onGrantorErasure: "archive"[\s\S]*admin\.studioAccess: "everyone"/,
    );
  });
});
