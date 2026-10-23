import { redactedRequestSerializer } from './redacted-request-serializer';

export const HTTP_LOG_REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.query.token',
  'req.query.sig',
  'res.headers["set-cookie"]',
  'res.headers["set-auth-token"]',
];

export const httpLogRedaction = {
  redact: {
    paths: HTTP_LOG_REDACTED_PATHS,
    censor: '[redacted]',
  },
  serializers: {
    req: redactedRequestSerializer,
  },
};
