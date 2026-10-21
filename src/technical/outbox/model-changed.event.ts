import type { ModelChangeKind } from './outbox.types';

export class ModelChanged {
  constructor(
    readonly model: string,
    readonly kind: ModelChangeKind,
    readonly recordId: string | null,
    readonly tenantId: string,
    readonly changedFields: string[],
    readonly userId: string | null,
    readonly impersonatedBy: string | null,
  ) {}
}
