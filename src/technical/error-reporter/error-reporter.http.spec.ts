import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HERY_CONFIG } from '#technical/config/hery-config';
import { DomainExceptionFilter } from '#technical/errors/domain-exception.filter';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { errorReporterDriverToken } from './error-reporter-driver';
import type {
  ErrorReportContext,
  ErrorReporterDriver,
} from './error-reporter-driver';
import { ErrorReporterModule } from './error-reporter.module';
import { ErrorReporterService } from './error-reporter.service';

interface Captured {
  error: Error;
  context: ErrorReportContext;
}

const captured: Captured[] = [];
let isDriverFailing = false;
let flushed = 0;

const recordingDriver: ErrorReporterDriver = {
  capture: (error, context) => {
    if (isDriverFailing) {
      return Promise.reject(new Error('sentry is unreachable'));
    }

    captured.push({ error, context });
    return Promise.resolve();
  },
  flush: () => {
    flushed += 1;
    return Promise.resolve();
  },
};

@Controller('reports')
class ReportsController {
  constructor(private readonly reporter: ErrorReporterService) {}

  @Get('boom')
  boom(): never {
    throw new Error('the connection string is postgres://user:hunter2@db');
  }

  @Get('missing')
  missing(): never {
    throw new RecordNotFoundException('thing');
  }

  @Get('handled')
  handled(): { ok: boolean } {
    this.reporter.capture(new Error('payment provider timed out'), {
      tags: { provider: 'stripe' },
      extra: { attempt: 2 },
    });
    return { ok: true };
  }
}

@Module({
  providers: [
    {
      provide: errorReporterDriverToken('recording'),
      useValue: recordingDriver,
    },
  ],
  exports: [errorReporterDriverToken('recording')],
})
class RecordingDriverModule {}

@Module({
  imports: [RecordingDriverModule, ErrorReporterModule],
  controllers: [ReportsController],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
class ReportsTestModule {}

describe('Error reporting over a real HTTP round trip', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ReportsTestModule],
    })
      .overrideProvider(HERY_CONFIG)
      .useValue({
        errorReporter: {
          default: 'recording',
          drivers: { recording: { driver: 'recording' } },
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    captured.length = 0;
    isDriverFailing = false;
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports an unexpected error with the id the response quotes and the request it came from', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/boom?token=secret')
      .expect(500);

    const { errorId } = (
      response.body as { error: { details: { errorId: string } } }
    ).error.details;

    expect(captured).toHaveLength(1);
    expect(captured[0]!.context.errorId).toBe(errorId);
    expect(captured[0]!.context.request).toEqual({
      method: 'GET',
      path: '/reports/boom',
    });
    expect(captured[0]!.error.message).toContain('hunter2');
  });

  it('never reports an error the framework raised on purpose', async () => {
    await request(app.getHttpServer()).get('/reports/missing').expect(404);

    expect(captured).toHaveLength(0);
  });

  it('lets application code report an error it handled, with its own tags', async () => {
    await request(app.getHttpServer()).get('/reports/handled').expect(200);

    expect(captured).toHaveLength(1);
    expect(captured[0]!.context.tags).toEqual({ provider: 'stripe' });
    expect(captured[0]!.context.extra).toEqual({ attempt: 2 });
  });

  it('still answers the 500 when the reporter itself fails', async () => {
    isDriverFailing = true;

    await request(app.getHttpServer()).get('/reports/boom').expect(500);

    expect(captured).toHaveLength(0);
  });

  it('flushes the driver on shutdown so a queued report is not lost', async () => {
    await app.close();

    expect(flushed).toBe(1);

    app = (
      await Test.createTestingModule({ imports: [ReportsTestModule] })
        .overrideProvider(HERY_CONFIG)
        .useValue({
          errorReporter: {
            default: 'recording',
            drivers: { recording: { driver: 'recording' } },
          },
        })
        .compile()
    ).createNestApplication();
    await app.init();
  });
});
