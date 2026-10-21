import { driverToken } from '#technical/drivers/driver-token';

export const ERROR_REPORTER_MODULE = 'error-reporter';

export function errorReporterDriverToken(driverName: string): symbol {
  return driverToken(ERROR_REPORTER_MODULE, driverName);
}

export interface ErrorReportRequest {
  method: string;
  path: string;
}

export interface ErrorReportUser {
  id: string;
  impersonatedBy: string | null;
}

export interface ErrorReportContext {
  errorId: string;
  tenantId: string | null;
  user: ErrorReportUser | null;
  request: ErrorReportRequest | null;
  tags: Record<string, string>;
  extra: Record<string, unknown>;
}

export interface ErrorReporterDriver {
  capture(error: Error, context: ErrorReportContext): Promise<void>;
  flush(timeoutMs: number): Promise<void>;
}
