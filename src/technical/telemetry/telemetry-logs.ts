import { trace } from '@opentelemetry/api';
import { SeverityNumber, logs } from '@opentelemetry/api-logs';
import type { AnyValueMap } from '@opentelemetry/api-logs';
import { telemetrySignals } from './telemetry-config';
import type { TelemetryEnv } from './telemetry-config';

const LOGGER_NAME = 'heryjs';

const SEVERITY_BY_PINO_LEVEL: Array<[number, SeverityNumber, string]> = [
  [60, SeverityNumber.FATAL, 'FATAL'],
  [50, SeverityNumber.ERROR, 'ERROR'],
  [40, SeverityNumber.WARN, 'WARN'],
  [30, SeverityNumber.INFO, 'INFO'],
  [20, SeverityNumber.DEBUG, 'DEBUG'],
  [0, SeverityNumber.TRACE, 'TRACE'],
];

type LogArguments = unknown[];

function severityOf(level: number): [SeverityNumber, string] {
  const [, number, text] = SEVERITY_BY_PINO_LEVEL.find(
    ([floor]) => level >= floor,
  )!;

  return [number, text];
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

export function attributesOf(fields: Record<string, unknown>): AnyValueMap {
  const attributes: AnyValueMap = {};

  for (const [key, value] of Object.entries(fields)) {
    if (isPrimitive(value)) {
      attributes[key] = value;
    }
  }

  if (fields.err instanceof Error) {
    attributes['exception.type'] = fields.err.name;
    attributes['exception.message'] = fields.err.message;

    if (fields.err.stack !== undefined) {
      attributes['exception.stacktrace'] = fields.err.stack;
    }
  }

  return attributes;
}

export function splitLogArguments(args: LogArguments): {
  fields: Record<string, unknown>;
  message: string;
} {
  const [first, second] = args;

  if (typeof first === 'string') {
    return { fields: {}, message: first };
  }

  if (first instanceof Error) {
    return { fields: { err: first }, message: first.message };
  }

  return {
    fields:
      typeof first === 'object' && first !== null
        ? (first as Record<string, unknown>)
        : {},
    message: typeof second === 'string' ? second : '',
  };
}

export function emitLog(level: number, args: LogArguments): void {
  const { fields, message } = splitLogArguments(args);
  const [severityNumber, severityText] = severityOf(level);

  logs.getLogger(LOGGER_NAME).emit({
    severityNumber,
    severityText,
    body: message,
    attributes: attributesOf(fields),
  });
}

export interface TelemetryPinoOptions {
  mixin: () => Record<string, string>;
  hooks?: {
    logMethod: (
      args: LogArguments,
      method: (...args: unknown[]) => void,
      level: number,
    ) => void;
  };
}

export function telemetryPinoOptions(
  env: TelemetryEnv = process.env,
): TelemetryPinoOptions {
  const mixin = (): Record<string, string> => {
    const span = trace.getActiveSpan();

    if (span === undefined) {
      return {};
    }

    const { traceId, spanId } = span.spanContext();
    return { trace_id: traceId, span_id: spanId };
  };

  if (!telemetrySignals(env).logs) {
    return { mixin };
  }

  return {
    mixin,
    hooks: {
      logMethod(this: unknown, args, method, level) {
        emitLog(level, args);
        method.apply(this, args);
      },
    },
  };
}
