export class FakeStorageObjectNotFoundException extends Error {
  constructor(key: string) {
    super(`No object is stored under "${key}" in the fake storage driver`);
    this.name = 'FakeStorageObjectNotFoundException';
  }
}
