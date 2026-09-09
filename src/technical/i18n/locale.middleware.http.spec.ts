import {
  Controller,
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DomainExceptionFilter } from '#technical/errors/domain-exception.filter';
import { NoCurrentTeamException } from '#technical/errors/no-current-team.exception';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { LocaleMiddleware } from './locale.middleware';

@Controller('demo')
class DemoController {
  @Get('no-current-team')
  noCurrentTeam(): never {
    throw new NoCurrentTeamException();
  }

  @Get('not-found')
  notFound(): never {
    throw new RecordNotFoundException('BlogPost');
  }
}

@Module({
  controllers: [DemoController],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
class DemoModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LocaleMiddleware).forRoutes('*');
  }
}

describe('LocaleMiddleware wired to a real endpoint', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DemoModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps the English message with no Accept-Language header', async () => {
    const response = await request(app.getHttpServer())
      .get('/demo/no-current-team')
      .expect(409);

    const body = response.body as { error: { key: string; message: string } };
    expect(body.error.key).toBe('team.noCurrentTeam');
    expect(body.error.message).toBe(
      'Join a team before creating records owned by one.',
    );
  });

  it('translates the message when the caller asks for a supported locale', async () => {
    const response = await request(app.getHttpServer())
      .get('/demo/no-current-team')
      .set('Accept-Language', 'fr-FR,fr;q=0.9,en;q=0.8')
      .expect(409);

    const body = response.body as { error: { key: string; message: string } };
    expect(body.error.key).toBe('team.noCurrentTeam');
    expect(body.error.message).toContain('équipe');
  });

  it('interpolates the resource into a translated template', async () => {
    const response = await request(app.getHttpServer())
      .get('/demo/not-found')
      .set('Accept-Language', 'fr')
      .expect(404);

    const body = response.body as { error: { key: string; message: string } };
    expect(body.error.key).toBe('BlogPost.notFound');
    expect(body.error.message).toBe('BlogPost introuvable.');
  });

  it('falls back to English for a locale it does not support', async () => {
    const response = await request(app.getHttpServer())
      .get('/demo/no-current-team')
      .set('Accept-Language', 'de')
      .expect(409);

    const body = response.body as { error: { message: string } };
    expect(body.error.message).toBe(
      'Join a team before creating records owned by one.',
    );
  });
});
