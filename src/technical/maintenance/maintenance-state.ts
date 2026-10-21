import { createHash, timingSafeEqual } from 'node:crypto';

export const MAINTENANCE_BYPASS_HEADER = 'x-hery-maintenance-secret';

export const DEFAULT_RETRY_AFTER_SECONDS = 60;

export interface MaintenanceState {
  secretHash: string | null;
  retryAfterSeconds: number;
  message: string | null;
  startedAt: string;
}

export function hashMaintenanceSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function isBypassSecret(
  state: MaintenanceState,
  candidate: string | undefined,
): boolean {
  if (state.secretHash === null || candidate === undefined) {
    return false;
  }

  const expected = Buffer.from(state.secretHash, 'hex');
  const received = Buffer.from(hashMaintenanceSecret(candidate), 'hex');

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function parseMaintenanceState(
  raw: string | null,
): MaintenanceState | null {
  if (raw === null) {
    return null;
  }

  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const { secretHash, retryAfterSeconds, message, startedAt } =
    parsed as Record<string, unknown>;

  return {
    secretHash: typeof secretHash === 'string' ? secretHash : null,
    retryAfterSeconds:
      typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0
        ? retryAfterSeconds
        : DEFAULT_RETRY_AFTER_SECONDS,
    message: typeof message === 'string' ? message : null,
    startedAt:
      typeof startedAt === 'string' ? startedAt : new Date(0).toISOString(),
  };
}
