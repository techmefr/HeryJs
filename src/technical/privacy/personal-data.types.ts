export type PersonalDataErasure = 'delete' | 'anonymise';

export type PersonalDataFieldType =
  | 'string'
  | 'richtext'
  | 'slug'
  | 'int'
  | 'boolean'
  | 'datetime'
  | 'file'
  | 'encrypted';

export interface PersonalDataField {
  name: string;
  type: PersonalDataFieldType;
  optional: boolean;
  translatable: boolean;
  // Only a personal field is wiped by an anonymising erasure. Every field is
  // exported, because what a person may ask for is everything held about them.
  personal: boolean;
}

/**
 * How one resource answers a privacy request. It is plain data on purpose: the
 * kernel runs the export and the erasure itself, against the resource's rows
 * (`ownerId` for one user, `tenantId` for a whole tenant), so a resource
 * declares what its rows are and never writes the erasure.
 */
export interface PersonalDataDeclaration {
  model: string;
  erase: PersonalDataErasure;
  fields: readonly PersonalDataField[];
}

/**
 * Who an erasure or an export is about, as the kernel read it before touching
 * anything: a table that keys its rows by address or number rather than by id
 * is matched on these.
 */
export interface PersonalDataSubject {
  tenantId: string;
  userId: string;
  email: string;
  phoneNumber: string | null;
}

/**
 * A table a module owns that holds data about a user without an `ownerId`: a
 * mail log, an identity link, a consent record. The module registers how its
 * rows are found, exported and erased; the kernel runs it with the rest of the
 * request, and never names the table itself. `models` lists the Prisma models
 * the hook answers for, so a coverage check can tell a declared table from a
 * forgotten one.
 */
export interface PersonalDataHook {
  name: string;
  models: readonly string[];
  exportUser(subject: PersonalDataSubject): Promise<unknown[]>;
  eraseUser(subject: PersonalDataSubject): Promise<number>;
  eraseTenant(tenantId: string, keptUserId: string | null): Promise<number>;
}

/**
 * Removes a stored object by key. The storage module registers one, so a
 * `file` field of an erased row loses its object and not only its key.
 */
export type StoredFileRemover = (key: string) => Promise<void>;
