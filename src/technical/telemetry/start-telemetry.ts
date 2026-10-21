import { env as appEnv } from '#technical/config/env';
import { isTelemetryEnabled, telemetryServiceName } from './telemetry-config';
import type { TelemetryEnv } from './telemetry-config';

interface TelemetryHandle {
  shutdown(): Promise<void>;
}

let handle: TelemetryHandle | null = null;

export async function startTelemetry(
  env: TelemetryEnv = appEnv,
): Promise<boolean> {
  if (handle !== null || !isTelemetryEnabled(env)) {
    return handle !== null;
  }

  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const sdk = new NodeSDK({ serviceName: telemetryServiceName(env) });

  sdk.start();
  handle = sdk;

  return true;
}

export async function shutdownTelemetry(): Promise<void> {
  if (handle === null) {
    return;
  }

  const stopping = handle;
  handle = null;
  await stopping.shutdown();
}
