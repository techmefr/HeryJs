export function buildTextSearchWhere(
  term: string | undefined,
  fields: readonly string[],
):
  | { OR: Record<string, { contains: string; mode: 'insensitive' }>[] }
  | undefined {
  if (!term || fields.length === 0) {
    return undefined;
  }

  return {
    OR: fields.map((field) => ({
      [field]: { contains: term, mode: 'insensitive' as const },
    })),
  };
}
