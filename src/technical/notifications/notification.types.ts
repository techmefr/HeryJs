import type { Page, PageQuery } from '#technical/http/page-query';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationProvider {
  send(
    userId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<Notification>;
  listFor(userId: string, page: PageQuery): Promise<Page<Notification>>;
  markRead(id: string, userId: string): Promise<Notification>;
}

export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');
