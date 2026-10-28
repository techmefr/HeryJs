import {
  Controller,
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  Param,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { context, metrics, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { env as appEnv } from '#technical/config/env';
import { MetricsInterceptor } from '#technical/monitoring/metrics.interceptor';
import { TraceContextStorage } from '#technical/tracing/trace-context';
import { TelemetryMiddleware } from './telemetry.middleware';

@Controller('orders')
class OrdersController {
  @Get(':id')
  find(@Param('id') id: string) {
    TraceContextStorage.pushStep({
      stage: 'guard',
      label: 'session',
      status: 'ok',
      durationMs: 1.5,
    });
    return { id };
  }

  @Get('fail/now')
  fail(): never {
    throw new Error('boom');
  }
}

@Module({
  controllers: [OrdersController],
  providers: [
    TelemetryMiddleware,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
class TelemetryTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TelemetryMiddleware).forRoutes('*');
  }
}

describe('Telemetry over a real HTTP round trip', () => {
  let app: INestApplication<App>;
  const spans = new InMemorySpanExporter();
  const metricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );
  const reader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60_000,
  });
  const contextManager = new AsyncLocalStorageContextManager();

  beforeAll(async () => {
    appEnv.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:1';
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(spans)],
      }),
    );
    metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));

    const moduleRef = await Test.createTestingModule({
      imports: [TelemetryTestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    spans.reset();
  });

  afterAll(async () => {
    delete appEnv.OTEL_EXPORTER_OTLP_ENDPOINT;
    await app.close();
    await reader.shutdown();
    contextManager.disable();
  });

  it('records one server span per request, named by route and not by the id in the URL', async () => {
    await request(app.getHttpServer()).get('/orders/42?token=x').expect(200);

    const [span] = spans.getFinishedSpans();

    expect(spans.getFinishedSpans()).toHaveLength(1);
    expect(span!.name).toBe('GET /orders/:id');
    expect(span!.attributes['http.route']).toBe('/orders/:id');
    expect(span!.attributes['http.response.status_code']).toBe(200);
    expect(span!.attributes['url.path']).toBe('/orders/42');
  });

  it('carries the pipeline steps the trace context already collects as span events', async () => {
    await request(app.getHttpServer()).get('/orders/42').expect(200);

    const [span] = spans.getFinishedSpans();

    expect(span!.events.map((event) => event.name)).toContain('guard: session');
  });

  it('continues a trace the caller started', async () => {
    const traceId = '0af7651916cd43dd8448eb211c80319c';

    await request(app.getHttpServer())
      .get('/orders/42')
      .set('traceparent', `00-${traceId}-b7ad6b7169203331-01`)
      .expect(200);

    const [span] = spans.getFinishedSpans();

    expect(span!.spanContext().traceId).toBe(traceId);
    expect(span!.parentSpanContext?.spanId).toBe('b7ad6b7169203331');
  });

  it('marks a server error on the span', async () => {
    await request(app.getHttpServer()).get('/orders/fail/now').expect(500);

    expect(spans.getFinishedSpans()[0]!.status.code).toBe(2);
  });

  it('mirrors the request duration as an OTel histogram', async () => {
    await request(app.getHttpServer()).get('/orders/7').expect(200);

    await reader.forceFlush();

    const names = metricExporter
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics)
      .flatMap((scope) => scope.metrics)
      .map((metric) => metric.descriptor.name);

    expect(names).toContain('http.server.request.duration');
  });
});
