# @heryjs/observe

Optional APM through [`@nestjs/observe`](https://github.com/nestjs/observe):
requests, jobs and errors as traces named after your classes and methods.

```bash
pnpm hery install observe
```

Add `'@heryjs/observe'` to `modules` in `hery.config.ts`. It is **off by
default**: until `OBSERVE_ENABLED=true`, nothing is recorded or sent.

Telemetry goes to the hosted collector at `observe-api.nestjs.com`, a third
party, unless `OBSERVE_ENDPOINT` points at a collector of your own. Logs
(`OBSERVE_FORWARD_LOGS`) and source fragments attached to errors
(`OBSERVE_SOURCE_CONTEXT`) are off unless you turn them on.

For a vendor-neutral setup with nothing leaving your network, the built-in
OpenTelemetry export (`OTEL_EXPORTER_OTLP_ENDPOINT`) covers traces, metrics
and logs.
