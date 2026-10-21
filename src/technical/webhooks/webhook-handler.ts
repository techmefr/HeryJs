export interface WebhookEventRecord {
  id: string;
  tenantId: string;
  source: string;
  payload: unknown;
}

export interface WebhookHandler {
  readonly source: string;
  handle(event: WebhookEventRecord): Promise<void>;
}

const handlers: WebhookHandler[] = [];

export function registerWebhookHandler(handler: WebhookHandler): void {
  if (handlers.includes(handler)) {
    return;
  }

  handlers.push(handler);
}

export function webhookHandlersFor(source: string): WebhookHandler[] {
  return handlers.filter((handler) => handler.source === source);
}

export function clearWebhookHandlers(): void {
  handlers.length = 0;
}
