import { api } from './api';
import type { DescribedController } from './api';

let pending: Promise<DescribedController[]> | null = null;

/**
 * The route map, fetched once per page load: the shell draws the sidebar from
 * it and the page draws its actions from it, and two requests for the same
 * answer would be one more thing to keep in step.
 */
export function loadControllers(): Promise<DescribedController[]> {
  pending ??= api<DescribedController[]>('/introspect')
    .then(({ data }) => data)
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });

  return pending;
}
