import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { LocalStorageProvider } from './local-storage.provider';

// Only relevant for the local driver -- S3 and MinIO serve signed URLs
// directly from the object store, this app never proxies that traffic.
@Controller('storage')
export class StorageController {
  constructor(private readonly local: LocalStorageProvider) {}

  @Get(':key')
  async serve(
    @Param('key') key: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    if (!this.local.verify(key, Number(exp), sig)) {
      throw new NotFoundException();
    }

    const body = await this.local.read(key);
    res.send(body);
  }
}
