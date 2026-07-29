import { useEffect, useState } from 'react';
import { apiFetch } from '../../api-fetch';

interface NotificationEntry {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsList() {
  const [notifications, setNotifications] = useState<
    NotificationEntry[] | null
  >(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    apiFetch('/notifications').then((body) => setNotifications(body.data));
  }

  async function markRead(id: string) {
    await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
    load();
  }

  if (!notifications) {
    return (
      <p className="text-neutral-500 dark:text-neutral-400">Loading...</p>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Notifications</h1>
      {notifications.length === 0 ? (
        <p className="text-neutral-500 dark:text-neutral-400">
          No notifications yet.
        </p>
      ) : (
        <div className="flex max-w-2xl flex-col gap-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-center justify-between rounded border px-4 py-3 ${
                notification.readAt
                  ? 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900'
                  : 'border-orange-300 bg-neutral-50 dark:border-orange-900 dark:bg-neutral-900'
              }`}
            >
              <div>
                <p className="font-mono text-sm">{notification.type}</p>
                <p className="text-xs text-neutral-500">
                  {new Date(notification.createdAt).toLocaleString()}
                </p>
              </div>
              {notification.readAt ? (
                <span className="text-xs text-neutral-500">Read</span>
              ) : (
                <button
                  type="button"
                  onClick={() => markRead(notification.id)}
                  className="rounded bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-500"
                >
                  Mark as read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
