import { AsyncLocalStorage } from 'node:async_hooks';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';

export type TelemetryChannel = 'mail' | 'sms' | 'push';

export type TelemetryEvent =
  | {
      kind: 'request';
      method: string;
      path: string;
      status: number;
      durationMs: number;
    }
  | { kind: 'query'; sql: string; durationMs: number }
  | {
      kind: 'job';
      queue: string;
      name: string;
      status: 'completed' | 'failed';
      durationMs: number | null;
      error: string | null;
    }
  | {
      kind: 'message';
      channel: TelemetryChannel;
      status: 'sent' | 'failed';
      recipient: string;
      subject: string | null;
      error: string | null;
    }
  | {
      kind: 'exception';
      name: string;
      message: string;
      stack: string | null;
      status: number;
    };

export type TelemetryRecord = TelemetryEvent & {
  tenantId: string | null;
  requestId: string | null;
  timestamp: Date;
};

export type TelemetryListener = (record: TelemetryRecord) => void;

interface TelemetryContext {
  requestId: string | null;
  isMuted: boolean;
}

interface EmitOptions {
  tenantId?: string | null;
  requestId?: string | null;
}

const storage = new AsyncLocalStorage<TelemetryContext>();
const listeners = new Set<TelemetryListener>();

/**
 * What the kernel reports to anyone who cares to listen, without ever knowing
 * who that is. The kernel may not import devtools/, so the Prisma client, the
 * exception filter, the mail, sms and push modules and the job queues emit
 * here and the dev dashboard subscribes from the other side of that boundary.
 *
 * With no listener, which is every production process that has not opted in,
 * `emit` returns before touching anything, so the instrumentation sprinkled
 * through the kernel costs one set-size check.
 */
export const TelemetryBus = {
  subscribe(listener: TelemetryListener): () => void {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },

  hasListeners(): boolean {
    return listeners.size > 0;
  },

  emit(event: TelemetryEvent, options: EmitOptions = {}): void {
    if (listeners.size === 0) {
      return;
    }

    const context = storage.getStore();

    if (context?.isMuted) {
      return;
    }

    const record: TelemetryRecord = {
      ...event,
      tenantId:
        options.tenantId !== undefined
          ? options.tenantId
          : TenantContextStorage.findTenantId(),
      requestId:
        options.requestId !== undefined
          ? options.requestId
          : (context?.requestId ?? null),
      timestamp: new Date(),
    };

    for (const listener of listeners) {
      try {
        listener(record);
      } catch {
        continue;
      }
    }
  },

  runInRequest<T>(requestId: string, callback: () => T): T {
    return storage.run({ requestId, isMuted: false }, callback);
  },

  /**
   * Whatever runs inside is invisible to every listener. A listener that
   * persists what it hears runs its own queries, and without this each of them
   * would be heard, persisted and heard again.
   */
  runMuted<T>(callback: () => T): T {
    return storage.run(
      { requestId: storage.getStore()?.requestId ?? null, isMuted: true },
      callback,
    );
  },

  isMuted(): boolean {
    return storage.getStore()?.isMuted ?? false;
  },

  currentRequestId(): string | null {
    return storage.getStore()?.requestId ?? null;
  },
};
