const MAX_LENGTH = 512;
const PROBE_ORIGIN = 'http://return-to.invalid';
const BACKSLASH = 0x5c;
const LAST_CONTROL = 0x1f;
const DELETE = 0x7f;

function hasUnsafeCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code === BACKSLASH || code <= LAST_CONTROL || code === DELETE) {
      return true;
    }
  }

  return false;
}

export function sanitizeReturnTo(value: string | undefined): string | null {
  if (!value || value.length > MAX_LENGTH) {
    return null;
  }

  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    hasUnsafeCharacter(value)
  ) {
    return null;
  }

  try {
    return new URL(value, PROBE_ORIGIN).origin === PROBE_ORIGIN ? value : null;
  } catch {
    return null;
  }
}
