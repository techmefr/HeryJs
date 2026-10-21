import { Injectable } from '@nestjs/common';
import type { OutboxHandler } from './outbox.types';

const WILDCARD = '*';

function matches(pattern: string, name: string): boolean {
  if (pattern === WILDCARD) {
    return true;
  }

  if (pattern.endsWith(WILDCARD)) {
    return name.startsWith(pattern.slice(0, -1));
  }

  return pattern === name;
}

@Injectable()
export class OutboxRegistry {
  private readonly handlers = new Map<string, OutboxHandler>();

  register(handler: OutboxHandler): void {
    if (this.handlers.has(handler.name)) {
      throw new Error(
        `An outbox handler named "${handler.name}" is already registered. The name keys its delivery receipts, so two handlers cannot share it.`,
      );
    }

    this.handlers.set(handler.name, handler);
  }

  handlersFor(messageName: string): OutboxHandler[] {
    return [...this.handlers.values()].filter((handler) =>
      handler.names.some((pattern) => matches(pattern, messageName)),
    );
  }
}
