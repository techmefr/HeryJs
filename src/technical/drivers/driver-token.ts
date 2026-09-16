/**
 * One token per (module, driver) pair, minted from the global symbol registry
 * so that a driver package and the registry that looks it up never have to
 * import each other -- they cannot, since a driver ships outside the kernel's
 * import graph and `.dependency-cruiser.cjs` forbids a module reaching into
 * another module.
 *
 * The alternative, one shared symbol per module, is a bug this repository has
 * already paid for once in search: two installed drivers both bind the same
 * token, whichever provider registers last silently overwrites the other, and
 * every call resolves to it with no error anywhere. Keying the token by driver
 * name makes that collision impossible to express.
 */
export function driverToken(moduleName: string, driverName: string): symbol {
  return Symbol.for(`heryjs:${moduleName}-driver:${driverName}`);
}
