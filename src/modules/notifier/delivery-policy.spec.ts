import { decideDelivery } from './delivery-policy';
import type { DeliveryQuery } from './delivery-policy';
import { DEFAULT_SETTINGS } from './notification-rules';
import type {
  NotificationRule,
  NotificationSettings,
} from './notification-rules';

const NOON_UTC = new Date('2026-10-21T12:00:00Z');
const MIDNIGHT_UTC = new Date('2026-10-21T00:30:00Z');

interface QueryOptions {
  channel?: DeliveryQuery['channel'];
  type?: string;
  isMandatory?: boolean;
  now?: Date;
  rules?: NotificationRule[];
  settings?: Partial<NotificationSettings>;
}

function query(options: QueryOptions): DeliveryQuery {
  return {
    channel: options.channel ?? 'mail',
    type: options.type ?? 'order.shipped',
    isMandatory: options.isMandatory ?? false,
    now: options.now ?? NOON_UTC,
    rules: {
      rules: options.rules ?? [],
      settings: { ...DEFAULT_SETTINGS, ...options.settings },
    },
  };
}

describe('decideDelivery', () => {
  it('delivers everything to a recipient who never set a preference', () => {
    expect(decideDelivery({ ...query({}), rules: null })).toEqual({
      action: 'deliver',
    });
    expect(decideDelivery(query({}))).toEqual({ action: 'deliver' });
  });

  it('lets a type rule beat the channel-wide rule in both directions', () => {
    const optedOutOfOneType = query({
      rules: [
        { channel: 'mail', type: '*', enabled: true, digest: false },
        {
          channel: 'mail',
          type: 'order.shipped',
          enabled: false,
          digest: false,
        },
      ],
    });
    const optedInToOneType = query({
      rules: [
        { channel: 'mail', type: '*', enabled: false, digest: false },
        {
          channel: 'mail',
          type: 'order.shipped',
          enabled: true,
          digest: false,
        },
      ],
    });

    expect(decideDelivery(optedOutOfOneType).action).toBe('skip');
    expect(decideDelivery(optedInToOneType).action).toBe('deliver');
  });

  it('applies a rule only to its own channel and type', () => {
    const rules: NotificationRule[] = [
      { channel: 'sms', type: 'order.shipped', enabled: false, digest: false },
    ];

    expect(decideDelivery(query({ rules, channel: 'mail' })).action).toBe(
      'deliver',
    );
    expect(
      decideDelivery(query({ rules, channel: 'sms', type: 'other' })).action,
    ).toBe('deliver');
    expect(decideDelivery(query({ rules, channel: 'sms' })).action).toBe(
      'skip',
    );
  });

  it('never lets a mandatory notification be suppressed', () => {
    const decision = decideDelivery(
      query({
        isMandatory: true,
        channel: 'push',
        rules: [{ channel: 'push', type: '*', enabled: false, digest: false }],
        settings: { quietHoursStart: '00:00', quietHoursEnd: '23:59' },
      }),
    );

    expect(decision).toEqual({ action: 'deliver' });
  });

  it('digests mail only, and only while the rule enables it', () => {
    const rules: NotificationRule[] = [
      { channel: 'mail', type: '*', enabled: true, digest: true },
    ];

    expect(decideDelivery(query({ rules })).action).toBe('digest');
    expect(decideDelivery(query({ rules, channel: 'push' })).action).toBe(
      'deliver',
    );
  });

  it('applies quiet hours to interruptive channels in the recipient timezone', () => {
    const settings = {
      timezone: 'Europe/Paris',
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
    };

    expect(
      decideDelivery(query({ channel: 'push', settings, now: MIDNIGHT_UTC }))
        .action,
    ).toBe('skip');
    expect(
      decideDelivery(query({ channel: 'push', settings, now: NOON_UTC }))
        .action,
    ).toBe('deliver');
    expect(
      decideDelivery(query({ channel: 'mail', settings, now: MIDNIGHT_UTC }))
        .action,
    ).toBe('deliver');
  });
});
