import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DomainExceptionFilter } from '#technical/errors/domain-exception.filter';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { metricsRegistry } from './metrics.registry';
import { MetricsInterceptor } from './metrics.interceptor';

@Controller('boom')
class BoomController {
  @Get()
  boom() {
    throw new RecordNotFoundException('thing');
  }

  @Get('ok')
  ok() {
    return { fine: true };
  }
}

/**
 * tap() only fires on the success path -- a request that throws used to
 * leave the error rate structurally at zero. This proves the interceptor
 * still counts a request that a guard or the controller itself rejects.
 */
describe('MetricsInterceptor over a real HTTP round trip', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BoomController],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
        { provide: APP_FILTER, useClass: DomainExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function statusLabelValue(route: string, status: number) {
    const metric = await metricsRegistry.getSingleMetricAsString(
      'http_requests_total',
    );
    const needle = `method="GET",route="${route}",status="${status}"`;
    const line = metric
      .split('\n')
      .find((entry) => entry.includes(needle) && !entry.startsWith('#'));
    return line ? Number(line.split(' ').pop()) : 0;
  }

  it('counts a request that throws, not just one that succeeds', async () => {
    const before = await statusLabelValue('/boom', 404);

    await request(app.getHttpServer()).get('/boom').expect(404);

    const after = await statusLabelValue('/boom', 404);
    expect(after).toBe(before + 1);
  });

  it('still counts a request that completes normally', async () => {
    const before = await statusLabelValue('/boom/ok', 200);

    await request(app.getHttpServer()).get('/boom/ok').expect(200);

    const after = await statusLabelValue('/boom/ok', 200);
    expect(after).toBe(before + 1);
  });
});
