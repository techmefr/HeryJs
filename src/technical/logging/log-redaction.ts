export const REDACTED = '[redacted]';

const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'newPassword',
  'currentPassword',
  'secret',
  'clientSecret',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'apiKey',
  'authorization',
  'cookie',
  'setCookie',
  'setAuthToken',
  'sig',
  'signature',
  'otp',
  'email',
  'newEmail',
  'phone',
  'phoneNumber',
  'mobile',
  'firstName',
  'lastName',
  'fullName',
  'displayName',
  'username',
  'address',
  'street',
  'postalCode',
  'zipCode',
];

const PERSON_KEYS = new Set(['email', 'phone', 'phonenumber', 'password']);
const PERSON_ONLY_KEYS = new Set(['name', 'image']);

const PATTERNS: ReadonlyArray<RegExp> = [
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,
  /\bBearer\s+[\w.~+/=-]+/gi,
  /[\w.+-]+(?:@|%40)[\w-]+(?:\.[\w-]+)+/gi,
  /(?<![\w+-])(?:\+|%2B)\d(?:[ .-]?\d){7,14}(?![\w-])/gi,
  /(?<![\w+-])0\d(?:[ .-]?\d{2}){4}(?![\w-])/g,
];

function normalised(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const sensitiveKeys = new Set(SENSITIVE_KEYS.map(normalised));

/**
 * Field names a resource declared personal (`*.personal-data.ts`) are added to
 * the redacted keys, so a logged row of that resource loses them by name.
 */
export function addPersonalLogFields(names: Iterable<string>): void {
  for (const name of names) {
    sensitiveKeys.add(normalised(name));
  }
}

const LABELLED_SECRET =
  /\b(token|password|passwd|secret|api[_-]?key|sig|otp)\b(["'\s:=]+)[^\s"'&,;]+/gi;

export function maskPersonalText(text: string): string {
  return PATTERNS.reduce(
    (masked, pattern) => masked.replace(pattern, REDACTED),
    text,
  ).replace(LABELLED_SECRET, `$1$2${REDACTED}`);
}

/**
 * What a log line may carry: a known sensitive or declared personal key loses
 * its value whatever it is, so does the `name` of an object that also carries
 * an address, a phone number or a password, and every remaining string is masked for the
 * addresses, phone numbers and tokens free text picks up from messages, error
 * messages and stack traces.
 */
export function redactForLog(value: unknown, seen = new WeakSet()): unknown {
  if (typeof value === 'string') {
    return maskPersonalText(value);
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return '[circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, seen));
  }

  if (value instanceof Error) {
    return {
      type: value.name,
      message: maskPersonalText(value.message),
      stack:
        value.stack === undefined ? undefined : maskPersonalText(value.stack),
    };
  }

  const entries = Object.entries(value);
  const isPerson = entries.some(([key]) => PERSON_KEYS.has(normalised(key)));
  const isSensitive = (key: string) =>
    sensitiveKeys.has(normalised(key)) ||
    (isPerson && PERSON_ONLY_KEYS.has(normalised(key)));

  return Object.fromEntries(
    entries.map(([key, field]) => [
      key,
      isSensitive(key) && field !== null && field !== undefined
        ? REDACTED
        : redactForLog(field, seen),
    ]),
  );
}

function parsedObject(raw: string): object | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function redactLogLine(line: string): string {
  const newline = line.endsWith('\n') ? '\n' : '';
  const raw = newline ? line.slice(0, -1) : line;
  const parsed = parsedObject(raw);

  return parsed === null
    ? `${maskPersonalText(raw)}${newline}`
    : `${JSON.stringify(redactForLog(parsed))}${newline}`;
}
