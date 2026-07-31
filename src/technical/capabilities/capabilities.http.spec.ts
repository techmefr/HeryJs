import {
  Controller,
  ForbiddenException,
  Get,
  INestApplication,
  Param,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { CapabilitiesService } from './capabilities.service';
import { CapabilityRecord, CapabilitySubject } from './capabilities.types';

const CURRENT_SUBJECT: CapabilitySubject = {
  id: 'user-1',
  teamIds: ['team-a'],
  currentTeamId: 'team-a',
  role: null,
};

const RECORDS: Record<string, CapabilityRecord> = {
  'record-mine': { ownerId: 'user-1' },
  'record-someone-elses': { ownerId: 'user-2' },
};

@Controller('demo')
class DemoController {
  constructor(private readonly capabilities: CapabilitiesService) {}

  @Get(':id')
  read(@Param('id') id: string) {
    const record = RECORDS[id];

    if (!record) {
      throw new RecordNotFoundException('record');
    }

    const decision = this.capabilities.resolve('own', CURRENT_SUBJECT, record);

    if (!decision.allowed) {
      throw new ForbiddenException({ capability: decision });
    }

    return { id, capability: decision };
  }
}

describe('capabilities wired to a real endpoint', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DemoController],
      providers: [CapabilitiesService],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with an allowed decision for an owned record', async () => {
    const response = await request(app.getHttpServer())
      .get('/demo/record-mine')
      .expect(200);

    expect(response.body).toEqual({
      id: 'record-mine',
      capability: { allowed: true, scope: 'own' },
    });
  });

  it('returns a real 403 for a record owned by someone else', async () => {
    const response = await request(app.getHttpServer())
      .get('/demo/record-someone-elses')
      .expect(403);

    expect((response.body as { capability: unknown }).capability).toEqual({
      allowed: false,
    });
  });
});
