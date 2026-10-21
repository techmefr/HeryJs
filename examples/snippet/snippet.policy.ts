import { Injectable } from '@nestjs/common';
import { CapabilitiesService } from '#technical/capabilities/capabilities.service';
import {
  resolveCapability,
  resolveCollectionCapability,
} from '#technical/capabilities/resolve-capability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';
import {
  CapabilityDecision,
  CapabilitySubject,
} from '#technical/capabilities/capabilities.types';
import { SNIPPET_PRESETS } from './snippet.presets';

export interface SnippetRecordLike {
  ownerId: string;
}

export const canCreateSnippet: PolicyCheck = (subject) =>
  resolveCollectionCapability(SNIPPET_PRESETS.create, subject);

export const canUpdateSnippet: PolicyCheck<SnippetRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(SNIPPET_PRESETS.update, subject, record)
    : { allowed: false };

// The outer gate on the bulk update route -- there is no single record yet
// to check against, so this is the same broad pass the collection search
// route takes, before canUpdateSnippet narrows per record inside the handler.
export const canUpdateAnySnippet: PolicyCheck = (subject) =>
  resolveCollectionCapability(SNIPPET_PRESETS.update, subject);

export const canDeleteSnippet: PolicyCheck<SnippetRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(SNIPPET_PRESETS.delete, subject, record)
    : { allowed: false };

// Same reasoning as canUpdateAnySnippet, for the bulk delete route.
export const canDeleteAnySnippet: PolicyCheck = (subject) =>
  resolveCollectionCapability(SNIPPET_PRESETS.delete, subject);

// Restore is the inverse of delete, not a kind of update -- whoever can
// delete a record decides whether it comes back, the same way
// canListTrashedSnippet already derives from the delete preset rather than
// the view preset. Its own capability rather than reusing canDeleteSnippet
// so a route can diverge later (e.g. restore always requiring 'all' even on
// an 'own'-scoped delete preset).
export const canRestoreSnippet: PolicyCheck<SnippetRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(SNIPPET_PRESETS.delete, subject, record)
    : { allowed: false };

export const canRestoreAnySnippet: PolicyCheck = (subject) =>
  resolveCollectionCapability(SNIPPET_PRESETS.delete, subject);

// Hard delete is not a scope on the delete preset -- own/team/all/none answer
// "whose records", not "how permanently". It is its own admin-only capability,
// checked in addition to (never instead of) the delete preset above.
export const canHardDeleteSnippet: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };

// Purge has no route today -- only the future admin decorator system reaches
// it -- but it is still gated by its own capability rather than reusing
// canHardDeleteSnippet, because a route may one day expose it under rules
// stricter than "any admin" (e.g. a second admin's approval).
export const canPurgeSnippet: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };

export const canViewSnippet: PolicyCheck<SnippetRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(SNIPPET_PRESETS.view, subject, record)
    : { allowed: false };

// Same preset as canViewSnippet: whoever may read one record may ask for the
// collection, and scopeWhereFor narrows that collection to the very same rows.
export const canViewAnySnippet: PolicyCheck = (subject) =>
  resolveCollectionCapability(SNIPPET_PRESETS.view, subject);

// Listing the bin is a moderation move, so it follows the delete preset rather
// than the read one.
export const canListTrashedSnippet: PolicyCheck = (subject) =>
  resolveCollectionCapability(SNIPPET_PRESETS.delete, subject);

@Injectable()
export class SnippetPolicy {
  constructor(private readonly capabilities: CapabilitiesService) {}

  recordCapabilities(
    subject: CapabilitySubject,
    record: SnippetRecordLike,
  ): Record<'update' | 'delete' | 'restore', CapabilityDecision> {
    return {
      update: this.capabilities.resolve(
        SNIPPET_PRESETS.update,
        subject,
        record,
      ),
      delete: this.capabilities.resolve(
        SNIPPET_PRESETS.delete,
        subject,
        record,
      ),
      restore: canRestoreSnippet(subject, record),
    };
  }

  metaCapabilities(
    subject: CapabilitySubject,
  ): Record<'create' | 'hardDelete' | 'listTrashed', CapabilityDecision> {
    return {
      create: canCreateSnippet(subject),
      hardDelete: canHardDeleteSnippet(subject),
      listTrashed: canListTrashedSnippet(subject),
    };
  }
}
