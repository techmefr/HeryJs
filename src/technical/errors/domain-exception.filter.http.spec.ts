import {
  BadRequestException,
  Body,
  Controller,
  INestApplication,
  Logger,
  Post,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import request from 'supertest';
import { App } from 'supertest/types';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { DomainExceptionFilter } from './domain-exception.filter';

const bodySchema = z.object({ title: z.string().min(1) });

@Controller('validated')
class ValidatedController {
  @Post()
  create(@Body(new ZodValidationPipe(bodySchema)) body: unknown) {
    return body;
  }

  // A message quoting whatever the caller sent is exactly what the error page
  // has to survive, whether it comes from a domain exception or from Nest's
  // own 404 carrying the request URL.
  @Post('echo')
  echo(@Body() body: { message: string }) {
    throw new BadRequestException(body.message);
  }

  @Post('boom')
  boom(): never {
    throw new Error('the connection string is postgres://user:hunter2@db');
  }
}

/**
 * The filter used to copy only `exception.message` for a plain HttpException,
 * so ZodValidationPipe's BadRequestException(result.error.flatten()) -- whose
 * body has no `message` key -- surfaced as the literal class name and lost
 * every field error.
 */
describe('DomainExceptionFilter over a plain HttpException', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ValidatedController],
      providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('surfaces the zod field errors in details instead of losing them', async () => {
    const response = await request(app.getHttpServer())
      .post('/validated')
      .send({ title: '' })
      .expect(400);

    const body = response.body as {
      error: { message: string; details?: { fieldErrors?: unknown } };
    };

    expect(body.error.details?.fieldErrors).toBeDefined();
  });

  it('escapes the message it renders into the HTML error page', async () => {
    const response = await request(app.getHttpServer())
      .post('/validated/echo')
      .set('Accept', 'text/html')
      .send({ message: '<script>alert(1)</script>' })
      .expect(400);

    expect(response.text).not.toContain('<script>alert(1)</script>');
    expect(response.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('logs an unrecognised error under an id the response carries back', async () => {
    const logged: string[] = [];
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });

    try {
      const response = await request(app.getHttpServer())
        .post('/validated/boom')
        .expect(500);

      const body = response.body as {
        error: { message: string; details: { errorId: string } };
      };

      // The client learns nothing about the failure...
      expect(body.error.message).toBe('Internal server error.');
      expect(JSON.stringify(body)).not.toContain('hunter2');

      // ...but the id it gets back is the one the stack was logged under.
      expect(body.error.details.errorId).toMatch(/^[0-9a-f-]{36}$/);
      expect(logged.join('\n')).toContain(body.error.details.errorId);
      expect(logged.join('\n')).toContain('hunter2');
    } finally {
      logger.mockRestore();
    }
  });
});
