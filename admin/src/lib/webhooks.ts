export type DeliveryStatus = 'pending' | 'delivered' | 'dead';

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  'pending',
  'delivered',
  'dead',
];

export interface SubscriptionForm {
  url: string;
  events: string;
  description: string;
}

export interface SubscriptionBody {
  url: string;
  events: string[];
  description?: string;
}

/**
 * Event names are typed as one comma or whitespace separated line, which is how
 * an operator thinks of them. The API holds the real rules (only webhook.* and
 * model.* names, at most twenty); this only turns the text into a list.
 */
export function parseEvents(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((name) => name.trim())
        .filter((name) => name !== ''),
    ),
  ];
}

export function subscriptionBody(form: SubscriptionForm): SubscriptionBody {
  const description = form.description.trim();

  return {
    url: form.url.trim(),
    events: parseEvents(form.events),
    ...(description === '' ? {} : { description }),
  };
}

export function deliveriesRoute(
  status: DeliveryStatus | null,
  page: number,
): string {
  const query = new URLSearchParams({ page: String(page), limit: '25' });

  if (status) {
    query.set('status', status);
  }

  return '/webhook-deliveries?' + query.toString();
}

export function statusTone(status: string): string {
  if (status === 'delivered') {
    return 'ok';
  }

  return status === 'dead' ? 'danger' : 'warn';
}
