export interface OutboxDelivery {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  tenantId: string | null;
  attempt: number;
  createdAt: Date;
}

export interface OutboxHandler {
  readonly name: string;
  readonly names: readonly string[];
  handle(delivery: OutboxDelivery): Promise<void> | void;
}

export interface OutboxMessageInput {
  name: string;
  payload: Record<string, unknown>;
  tenantId: string | null;
}

export type ModelChangeKind = 'created' | 'updated' | 'deleted';

export interface ModelChangePayload extends Record<string, unknown> {
  model: string;
  kind: ModelChangeKind;
  recordId: string | null;
  tenantId: string;
  changedFields: string[];
  userId: string | null;
  impersonatedBy: string | null;
}

export interface OutboxStageClient {
  outboxMessage: {
    createMany(args: {
      data: {
        tenantId: string | null;
        name: string;
        payload: object;
      }[];
    }): PromiseLike<unknown>;
  };
}
