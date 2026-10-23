export interface WaitForOptions {
  timeoutMs?: number;
  intervalMs?: number;
  description?: string;
}

/**
 * Polls `probe` until it returns something truthy and hands that value back.
 * A spec waits on what it expects to observe, never on a fixed delay: a sleep
 * long enough on an idle laptop is too short on a loaded CI runner, and a sleep
 * long enough for the runner wastes time everywhere else.
 */
export async function waitFor<T>(
  probe: () => T | Promise<T>,
  { timeoutMs = 10_000, intervalMs = 25, description }: WaitForOptions = {},
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const value = await probe();

    if (value) {
      return value;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for ${description ?? 'the condition'}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
