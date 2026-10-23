import { Injectable } from '@nestjs/common';
import {
  type Embedder,
  EmbeddingDimensionMismatchException,
} from '#kernel/public/drivers';
import { EmbeddingDriverRegistry } from './embedding-driver.registry';

@Injectable()
export class EmbeddingsService implements Embedder {
  constructor(private readonly drivers: EmbeddingDriverRegistry) {}

  get dimensions(): number {
    return this.drivers.active.dimensions;
  }

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.embedMany([text]);

    if (!vector) {
      throw new EmbeddingDimensionMismatchException(this.dimensions, 0);
    }

    return vector;
  }

  async embedMany(texts: readonly string[]): Promise<number[][]> {
    const driver = this.drivers.active;
    const vectors = await driver.embed(texts);

    for (const vector of vectors) {
      if (vector.length !== driver.dimensions) {
        throw new EmbeddingDimensionMismatchException(
          driver.dimensions,
          vector.length,
        );
      }
    }

    return vectors;
  }
}
