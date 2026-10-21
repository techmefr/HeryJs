---
title: OpenTelemetry
description: "Send traces, metrics and logs to any OTLP backend by setting one variable. Nothing is loaded, and nothing leaves the process, until you do."
---

`/metrics` answers a Prometheus scrape and the request inspector answers a
developer on their own machine. Neither answers "which of the four hundred
requests a second was slow, and what was it doing", which is what a trace
backend (Tempo, Jaeger, Honeycomb, Datadog) is for. This is the export that
feeds one.

## Turning it on

It is off. Set the standard OTLP endpoint and it is on, for all three signals:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=billing-api
```

Everything else is the standard `OTEL_*` configuration, read by the
OpenTelemetry SDK itself: `OTEL_EXPORTER_OTLP_HEADERS` for an API key,
`OTEL_EXPORTER_OTLP_PROTOCOL` (`http/protobuf` by default), `OTEL_RESOURCE_ATTRIBUTES`,
`OTEL_TRACES_SAMPLER`. A backend's own documentation already says which to set,
and none of it is specific to this framework.

| Variable | Effect |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | enables every signal |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `..._METRICS_...`, `..._LOGS_...` | enables that one signal, to its own collector |
| `OTEL_TRACES_EXPORTER=none`, `OTEL_METRICS_EXPORTER=none`, `OTEL_LOGS_EXPORTER=none` | turns one signal off |
| `OTEL_SDK_DISABLED=true` | turns everything off, whatever else is set |

With none of the endpoints set, the SDK is not even imported: the application
boots as it always did and pays for none of it.

## What is exported

**Traces.** One server span per request, continuing the caller's `traceparent`
when there is one, named after the route (`GET /orders/:id`) and never the URL,
so a trace backend does not grow a span name per id. Each step the
[request inspector](/HeryJs/guides/cli) already records (a guard, the tenant
resolution, a Prisma query) is added to the span as an event, with its status
and duration, in production too: the inspector keeps them in memory in
development only, the span carries them out.

**Metrics.** `http.server.request.duration`, a histogram in seconds by method,
route and status code, recorded at the same point as the Prometheus
`http_request_duration_seconds`. The Prometheus endpoint is unchanged and keeps
working alongside it.

**Logs.** Every log line is also emitted as an OTel log record at the matching
severity, and every line, exported or not, now carries `trace_id` and `span_id`
while a request is in flight, so a log found in one tool leads to its trace in
another.

A log record carries the line's message and its **top-level scalar fields**
only. The request object a logged request has attached to it is redacted by
the logger after the point where it is exported from, so it is not copied at
all: an `Authorization` header cannot reach a collector through the log signal.

## Shutting down

When telemetry is on, the application handles `SIGTERM` and flushes what the
exporters still hold before it exits, so the last seconds of a deployment are
not the ones missing from the trace.

## Custom spans and instruments

The application uses the plain `@opentelemetry/api`, so a service can add its
own span or counter without anything from this framework:

```ts
import { trace } from '@opentelemetry/api';

await trace.getTracer('billing').startActiveSpan('reconcile', async span => {
  await this.reconcile();
  span.end();
});
```

With telemetry off these calls do nothing and cost almost nothing.
