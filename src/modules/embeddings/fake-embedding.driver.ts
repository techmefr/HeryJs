import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EmbeddingDriver } from '#technical/embeddings/embedding-driver';
import { embeddingsEnv } from './embeddings.env';

const WORD_PATTERN = /[\p{L}\p{N}]+/gu;
const EMPTY_TEXT_TOKEN = '';

function wordsOf(text: string): string[] {
  const words = text.toLowerCase().match(WORD_PATTERN) ?? [];

  return words.length > 0 ? words : [EMPTY_TEXT_TOKEN];
}

@Injectable()
export class FakeEmbeddingDriver implements EmbeddingDriver {
  readonly dimensions: number = embeddingsEnv.EMBEDDINGS_DIMENSIONS;

  embed(texts: readonly string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => this.vectorFor(text)));
  }

  private vectorFor(text: string): number[] {
    const vector = Array.from({ length: this.dimensions }, () => 0);

    for (const word of wordsOf(text)) {
      const digest = createHash('sha256').update(word).digest();
      const index = digest.readUInt32BE(0) % this.dimensions;
      const sign = (digest[4] ?? 0) % 2 === 0 ? 1 : -1;
      vector[index] = (vector[index] ?? 0) + sign;
    }

    const norm = Math.hypot(...vector);

    return norm === 0 ? vector : vector.map((value) => value / norm);
  }
}
