import type { IncomingMessage } from 'node:http';
import { redactedRequestSerializer } from './redacted-request-serializer';

function fakeRequest(url: string): IncomingMessage {
  return { method: 'GET', url, headers: {} } as IncomingMessage;
}

describe('redactedRequestSerializer', () => {
  it('redacts a signal token carried in the query string', () => {
    const serialized = redactedRequestSerializer(
      fakeRequest('/signal/stream?token=super-secret'),
    );

    expect(serialized.url).toBe('/signal/stream?token=%5Bredacted%5D');
  });

  it('redacts a storage signature carried in the query string', () => {
    const serialized = redactedRequestSerializer(
      fakeRequest('/storage/some-key?sig=super-secret'),
    );

    expect(serialized.url).toBe('/storage/some-key?sig=%5Bredacted%5D');
  });

  it('leaves a url with no sensitive query params untouched', () => {
    const serialized = redactedRequestSerializer(
      fakeRequest('/blog-posts?limit=10'),
    );

    expect(serialized.url).toBe('/blog-posts?limit=10');
  });
});
