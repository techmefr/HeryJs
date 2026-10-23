import {
  EmbeddingDimensionMismatchException,
  type EmbeddingDriver,
} from '@heryjs/core/drivers';
import type { EmbeddingDriverRegistry } from './embedding-driver.registry';
import { EmbeddingsService } from './embeddings.service';

function serviceOver(driver: EmbeddingDriver): EmbeddingsService {
  return new EmbeddingsService({
    active: driver,
  } as unknown as EmbeddingDriverRegistry);
}

describe('EmbeddingsService', () => {
  it('exposes the active driver dimensions', () => {
    const service = serviceOver({ dimensions: 3, embed: jest.fn() });

    expect(service.dimensions).toBe(3);
  });

  it('embeds one text through the active driver', async () => {
    const embed = jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);
    const service = serviceOver({ dimensions: 3, embed });

    await expect(service.embedOne('hello')).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(embed).toHaveBeenCalledWith(['hello']);
  });

  it('refuses a vector whose width differs from the driver declaration', async () => {
    const service = serviceOver({
      dimensions: 3,
      embed: jest.fn().mockResolvedValue([[1, 2]]),
    });

    await expect(service.embedOne('hello')).rejects.toThrow(
      EmbeddingDimensionMismatchException,
    );
  });

  it('refuses a driver that returns nothing', async () => {
    const service = serviceOver({
      dimensions: 3,
      embed: jest.fn().mockResolvedValue([]),
    });

    await expect(service.embedOne('hello')).rejects.toThrow(
      EmbeddingDimensionMismatchException,
    );
  });
});
