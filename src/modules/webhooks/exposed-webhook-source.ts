const EXPOSED_SOURCE_PREFIX = 'expose:';

export function exposedSourceFor(actionName: string): string {
  return `${EXPOSED_SOURCE_PREFIX}${actionName}`;
}

export function exposedActionOf(source: string): string | null {
  return source.startsWith(EXPOSED_SOURCE_PREFIX)
    ? source.slice(EXPOSED_SOURCE_PREFIX.length)
    : null;
}
