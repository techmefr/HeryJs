import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PublicRoute } from '#technical/capabilities/public-route.decorator';
import { LocalStorageProvider } from './local-storage.provider';
import { StorageSignatureGuard } from './storage-signature.guard';

// Only relevant for the local driver -- S3 and MinIO serve signed URLs
// directly from the object store, this app never proxies that traffic.
@Controller('storage')
export class StorageController {
  constructor(private readonly local: LocalStorageProvider) {}

  @Get(':key')
  @UseGuards(StorageSignatureGuard)
  @PublicRoute('signed URL: the HMAC signature and expiry are the credential')
  async serve(@Param('key') key: string, @Res() res: Response) {
    const [body, contentType] = await Promise.all([
      this.local.read(key),
      this.local.contentTypeOf(key),
    ]);

    // nosniff matters as much as the content type itself: without it, a
    // browser that doesn't trust a mislabeled type will still sniff an
    // uploaded HTML/SVG file and execute it same-origin.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(contentType).send(body);
  }
}
