export class FakeAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FakeAssertionError';
  }
}
