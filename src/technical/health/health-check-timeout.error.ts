export class HealthCheckTimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`health check "${name}" did not answer within ${timeoutMs}ms`);
    this.name = 'HealthCheckTimeoutError';
  }
}
