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
