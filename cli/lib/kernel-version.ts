/**
 * The version of HeryJs itself, which is not the version of the project built
 * on it: `hery new` renames the project in package.json and leaves it free to
 * version its own releases, so the number here -- copied into every project
 * along with cli/ -- is the only record of which kernel a project was
 * generated from. A module declares the range it was written against in
 * `meta.compatibility`, and this is what that range is checked against before
 * anything is written.
 */
export const KERNEL_VERSION = '0.0.1';
