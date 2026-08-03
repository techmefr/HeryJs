import { Body, Controller, INestApplication, Post } from '@nestjs/common';
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
});
