import { driverToken } from '#technical/drivers/driver-token';

export const EMBEDDINGS_MODULE = 'embeddings';

export function embeddingDriverToken(driverName: string): symbol {
  return driverToken(EMBEDDINGS_MODULE, driverName);
}

export interface EmbeddingDriver {
  readonly dimensions: number;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export interface Embedder {
  readonly dimensions: number;
  embedOne(text: string): Promise<number[]>;
}

export const EMBEDDER = Symbol('EMBEDDER');
