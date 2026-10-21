import { shutdownTelemetry, startTelemetry } from './start-telemetry';

describe('startTelemetry', () => {
  afterEach(async () => {
    await shutdownTelemetry();
  });

  it('does nothing, and loads no SDK, without an endpoint', async () => {
    expect(await startTelemetry({})).toBe(false);
  });

  it('starts the SDK against the configured endpoint and shuts it down cleanly', async () => {
    const isStarted = await startTelemetry({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:1',
    });

    expect(isStarted).toBe(true);
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
  });

  it('is idempotent', async () => {
    const env = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:1' };

    await startTelemetry(env);

    expect(await startTelemetry(env)).toBe(true);
  });
});
