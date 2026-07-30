export const SEARCH_DRIVER = Symbol('SEARCH_DRIVER');

export interface SearchDriver {
  index(
    collection: string,
    id: string,
    document: Record<string, unknown>,
  ): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
  search(
    collection: string,
    term: string,
    fields: readonly string[],
  ): Promise<string[]>;
}
