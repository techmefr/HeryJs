import type { Prisma } from '@prisma/client';

export const DEV_DASHBOARD_KINDS = [
  'request',
  'slow-query',
  'n-plus-one',
  'job',
  'mail',
  'sms',
  'push',
  'exception',
] as const;

export type DevDashboardKind = (typeof DEV_DASHBOARD_KINDS)[number];

export interface NewDevDashboardEntry {
  tenantId: string;
  kind: DevDashboardKind;
  label: string;
  status: string | null;
  durationMs: number | null;
  requestId: string | null;
  detail: Prisma.InputJsonValue | null;
  createdAt: Date;
}

export function isDevDashboardKind(value: unknown): value is DevDashboardKind {
  return DEV_DASHBOARD_KINDS.some((kind) => kind === value);
}
