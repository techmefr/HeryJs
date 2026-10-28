import {
  clearAppInstrument,
  registerAppInstrument,
  registeredAppInstrument,
} from './app-instrument';

describe('app instrument', () => {
  afterEach(clearAppInstrument);

  it('is empty until a module registers one', () => {
    expect(registeredAppInstrument()).toBeNull();
  });

  it('hands back what a module registered, for the bootstrap to pass to Nest', () => {
    const instrument = { instanceDecorator: (instance: unknown) => instance };

    registerAppInstrument(instrument);

    expect(registeredAppInstrument()).toBe(instrument);
  });
});
