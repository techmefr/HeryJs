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
import { SNIPPET_PRESETS, SNIPPET_TRANSITION_PRESETS } from './snippet.presets';
import type { RecordShare } from '#technical/capabilities/capabilities.types';

export interface SnippetRecordLike {
  ownerId: string;
  shares?: readonly RecordShare[];
}

export const canCreateSnippet: PolicyCheck = (subject) =>
  resolveCollectionCapability(SNIPPET_PRESETS.create, subject);

export const canUpdateSnippet: PolicyCheck<SnippetRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(SNIPPET_PRESETS.update, subject, record, 'write')
    : { allowed: false };

// Sharing a record is a decision of its own, taken against the update preset
// and deliberately blind to the shares themselves: whoever was handed write
// access to a record cannot hand it on, so the owner stays the one who decides
// who else gets in.
export const canShareSnippet: PolicyCheck<SnippetRecordLike> = (
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

// The past of a record is read under the same rule as the record: whoever may
// see it, a reader by share included, may see what it used to be. Its own check
// rather than canViewSnippet so a project can tighten history alone
// without touching the read route.
export const canViewHistorySnippet: PolicyCheck<SnippetRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(SNIPPET_PRESETS.view, subject, record, 'read')
    : { allowed: false };

// Putting a snapshot back is an update, whatever route it travels: it writes
// the record, so the update preset decides, per record, like canUpdateSnippet.
export const canRevertSnippet: PolicyCheck<SnippetRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(SNIPPET_PRESETS.update, subject, record, 'write')
    : { allowed: false };

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
    ? resolveCapability(SNIPPET_PRESETS.view, subject, record, 'read')
    : { allowed: false };

// Same preset as canViewSnippet: whoever may read one record may ask for the
// collection, and scopeWhereFor narrows that collection to the very same rows.
export const canViewAnySnippet: PolicyCheck = (subject) =>
  resolveCollectionCapability(SNIPPET_PRESETS.view, subject);

// Listing the bin is a moderation move, so it follows the delete preset rather
// than the read one.
export const canListTrashedSnippet: PolicyCheck = (subject) =>
  resolveCollectionCapability(SNIPPET_PRESETS.delete, subject);

// Its own capability: being allowed to edit a snippet does not make
// "publish" yours to fire. The preset comes from the blueprint's
// transition, not from update. A write share opens it, as it opens update.
export const canPublishSnippet: PolicyCheck<SnippetRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(
        SNIPPET_TRANSITION_PRESETS.publish,
        subject,
        record,
        'write',
      )
    : { allowed: false };

// Its own capability: being allowed to edit a snippet does not make
// "archive" yours to fire. The preset comes from the blueprint's
// transition, not from update. A write share opens it, as it opens update.
export const canArchiveSnippet: PolicyCheck<SnippetRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(
        SNIPPET_TRANSITION_PRESETS.archive,
        subject,
        record,
        'write',
      )
    : { allowed: false };

// Its own capability: being allowed to edit a snippet does not make
// "reopen" yours to fire. The preset comes from the blueprint's
// transition, not from update. A write share opens it, as it opens update.
export const canReopenSnippet: PolicyCheck<SnippetRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(
        SNIPPET_TRANSITION_PRESETS.reopen,
        subject,
        record,
        'write',
      )
    : { allowed: false };

// The outer gate on the transition route: there is no single record yet, so
// this is the broad pass a reader of the resource takes, before each entry is
// checked against its own transition's capability.
export const canTransitionAnySnippet: PolicyCheck = (subject) =>
  resolveCollectionCapability(SNIPPET_PRESETS.view, subject);
@Injectable()
export class SnippetPolicy {
  constructor(private readonly capabilities: CapabilitiesService) {}

  recordCapabilities(
    subject: CapabilitySubject,
    record: SnippetRecordLike,
  ): Record<
    | 'update'
    | 'delete'
    | 'share'
    | 'restore'
    | 'publish'
    | 'archive'
    | 'reopen'
    | 'history'
    | 'revert',
    CapabilityDecision
  > {
    return {
      update: this.capabilities.resolve(
        SNIPPET_PRESETS.update,
        subject,
        record,
        'write',
      ),
      delete: this.capabilities.resolve(
        SNIPPET_PRESETS.delete,
        subject,
        record,
      ),
      share: canShareSnippet(subject, record),
      restore: canRestoreSnippet(subject, record),
      publish: canPublishSnippet(subject, record),
      archive: canArchiveSnippet(subject, record),
      reopen: canReopenSnippet(subject, record),
      history: canViewHistorySnippet(subject, record),
      revert: canRevertSnippet(subject, record),
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
