import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { WorkoutModule } from '../../../examples/workout/workout.module';
import { registerAndLogin } from '#devtools/testing/register-and-login';

interface TraceStep {
  stage: string;
  label: string;
  status: string;
}

interface TraceRecord {
  method: string;
  path: string;
  status: number;
  steps: TraceStep[];
  blockedStepIndex: number | null;
}

describe('pipeline trace', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, WorkoutModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('records every stage of a successful request, including prisma queries', async () => {
    const { token } = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post('/workouts/search')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/pipeline/traces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const traces = (response.body as { data: TraceRecord[] }).data;
    const trace = traces.find(
      (candidate) =>
        candidate.path === '/workouts/search' && candidate.status === 200,
    );

    expect(trace).toBeDefined();
    expect(trace?.blockedStepIndex).toBeNull();
    expect(trace?.steps).toContainEqual(
      expect.objectContaining({
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
      }),
    );
    expect(trace?.steps).toContainEqual(
      expect.objectContaining({
        stage: 'guard',
        label: 'session',
        status: 'ok',
      }),
    );
    expect(trace?.steps).toContainEqual(
      expect.objectContaining({ stage: 'controller', status: 'ok' }),
    );
    expect(trace?.steps.some((step) => step.stage === 'prisma')).toBe(true);
  });

  it('marks the guard step that blocked a rejected request', async () => {
    await request(app.getHttpServer()).get('/workouts/describe').expect(401);

    const { token } = await registerAndLogin(app);
    const response = await request(app.getHttpServer())
      .get('/pipeline/traces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const traces = (response.body as { data: TraceRecord[] }).data;
    const trace = traces.find(
      (candidate) =>
        candidate.path === '/workouts/describe' && candidate.status === 401,
    );

    expect(trace).toBeDefined();
    expect(trace?.blockedStepIndex).not.toBeNull();
    expect(trace?.steps[trace.blockedStepIndex as number]).toEqual(
      expect.objectContaining({
        stage: 'guard',
        label: 'session',
        status: 'blocked',
      }),
    );
  });
});
