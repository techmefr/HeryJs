import {
  isTelemetryEnabled,
  telemetryServiceName,
  telemetrySignals,
} from './telemetry-config';

describe('telemetry configuration', () => {
  it('is off when no OTLP endpoint is configured', () => {
    expect(isTelemetryEnabled({})).toBe(false);
    expect(isTelemetryEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: '  ' })).toBe(
      false,
    );
  });

  it('turns every signal on from the shared endpoint', () => {
    expect(
      telemetrySignals({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
      }),
    ).toEqual({ traces: true, metrics: true, logs: true });
  });

  it('turns on only the signal that has its own endpoint', () => {
    expect(
      telemetrySignals({
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://collector:4318/v1/traces',
      }),
    ).toEqual({ traces: true, metrics: false, logs: false });
  });

  it('honours the per-signal exporter switch', () => {
    expect(
      telemetrySignals({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
        OTEL_LOGS_EXPORTER: 'none',
      }),
    ).toEqual({ traces: true, metrics: true, logs: false });
  });

  it('is off whatever the endpoint when the SDK is disabled', () => {
    expect(
      isTelemetryEnabled({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
        OTEL_SDK_DISABLED: 'true',
      }),
    ).toBe(false);
  });

  it('names the service heryjs unless told otherwise', () => {
    expect(telemetryServiceName({})).toBe('heryjs');
    expect(telemetryServiceName({ OTEL_SERVICE_NAME: 'billing-api' })).toBe(
      'billing-api',
    );
  });
});
