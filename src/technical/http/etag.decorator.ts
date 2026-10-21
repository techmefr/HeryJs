import { SetMetadata } from '@nestjs/common';

export const CACHEABLE_READ_KEY = 'cacheable-read';

export const CacheableRead = () => SetMetadata(CACHEABLE_READ_KEY, true);
