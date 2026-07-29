export function ok<T>(data: T): { data: T; messages: [] };
export function ok<T, TMeta>(
  data: T,
  meta: TMeta,
): { data: T; meta: TMeta; messages: [] };
export function ok<T, TMeta>(data: T, meta?: TMeta) {
  return meta === undefined
    ? { data, messages: [] }
    : { data, meta, messages: [] };
}
