import { FakeEmbeddingDriver } from './fake-embedding.driver';

function dot(left: number[], right: number[]): number {
  return left.reduce(
    (sum, value, index) => sum + value * (right[index] ?? 0),
    0,
  );
}

describe('FakeEmbeddingDriver', () => {
  const driver = new FakeEmbeddingDriver();

  it('returns one vector per text, as wide as the driver declares', async () => {
    const vectors = await driver.embed(['squat rack', 'deadlift']);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(driver.dimensions);
  });

  it('gives the same text the same vector every time', async () => {
    const [first] = await driver.embed(['barbell back squat']);
    const [second] = await driver.embed(['barbell back squat']);

    expect(first).toEqual(second);
  });

  it('returns unit vectors, so cosine and dot product agree', async () => {
    const [vector] = await driver.embed(['kettlebell swing']);

    expect(dot(vector ?? [], vector ?? [])).toBeCloseTo(1, 6);
  });

  it('puts texts that share words closer than texts that share none', async () => {
    const [query, related, unrelated] = await driver.embed([
      'squat rack setup',
      'squat rack',
      'banana bread recipe',
    ]);

    expect(dot(query ?? [], related ?? [])).toBeGreaterThan(
      dot(query ?? [], unrelated ?? []),
    );
  });

  it('ignores case and punctuation', async () => {
    const [plain, noisy] = await driver.embed(['Squat Rack', 'squat, rack!']);

    expect(plain).toEqual(noisy);
  });

  it('embeds an empty text instead of returning a zero vector', async () => {
    const [vector] = await driver.embed(['']);

    expect(Math.hypot(...(vector ?? []))).toBeCloseTo(1, 6);
  });
});
