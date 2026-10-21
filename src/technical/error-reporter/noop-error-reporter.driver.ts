import { Injectable } from '@nestjs/common';
import type { ErrorReporterDriver } from './error-reporter-driver';

@Injectable()
export class NoopErrorReporterDriver implements ErrorReporterDriver {
  capture(): Promise<void> {
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}
