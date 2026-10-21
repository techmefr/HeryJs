import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthRegistry } from '#technical/health/health-registry';
import { HealthProbeController } from './health-probe.controller';

describe('Health probes over a real HTTP round trip', () => {
  let app: INestApplication<App>;
  let registry: HealthRegistry;
  let isDatabaseUp = true;

  beforeAll(async () => {
    registry = new HealthRegistry();
    registry.register({
      name: 'process',
      probes: ['liveness'],
      check: async () => undefined,
    });
    registry.register({
      name: 'database',
      probes: ['readiness'],
      check: async () => {
        if (!isDatabaseUp) {
          throw new Error('password authentication failed for user heryjs');
        }
      },
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthProbeController],
      providers: [{ provide: HealthRegistry, useValue: registry }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers liveness without credentials', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('answers readiness 200 while every dependency is up', async () => {
    isDatabaseUp = true;

    await request(app.getHttpServer()).get('/health/ready').expect(200);
  });

  it('answers readiness 503 without leaking the failure, while liveness stays 200', async () => {
    isDatabaseUp = false;

    const ready = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);

    expect(ready.body).toEqual({ status: 'error' });
    expect(JSON.stringify(ready.body)).not.toContain('password');

    await request(app.getHttpServer()).get('/health/live').expect(200);
  });
});
