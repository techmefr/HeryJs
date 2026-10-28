export interface SentryDsn {
  publicKey: string;
  envelopeUrl: string;
}

export function parseSentryDsn(dsn: string): SentryDsn {
  let url: URL;

  try {
    url = new URL(dsn);
  } catch {
    throw new Error('SENTRY_DSN is not a valid URL.');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const projectId = segments.pop();

  if (!url.username || !projectId) {
    throw new Error(
      'SENTRY_DSN must look like https://<key>@<host>/<project id>.',
    );
  }

  const prefix = segments.length > 0 ? `/${segments.join('/')}` : '';

  return {
    publicKey: url.username,
    envelopeUrl: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/`,
  };
}
