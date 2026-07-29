export function ok<T>(
  data: T,
  messages?: string[],
): { data: T; messages: string[] };
export function ok<T, TMeta>(
  data: T,
  meta: TMeta,
  messages?: string[],
): { data: T; meta: TMeta; messages: string[] };
export function ok<T, TMeta>(
  data: T,
  metaOrMessages?: TMeta | string[],
  messages?: string[],
) {
  if (Array.isArray(metaOrMessages)) {
    return { data, messages: metaOrMessages };
  }
  if (metaOrMessages === undefined) {
    return { data, messages: messages ?? [] };
  }
  return { data, meta: metaOrMessages, messages: messages ?? [] };
}
