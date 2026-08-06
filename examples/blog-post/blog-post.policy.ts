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
import { BLOG_POST_PRESETS } from './blog-post.presets';

export interface BlogPostRecordLike {
  ownerId: string;
}

export const canCreateBlogPost: PolicyCheck = (subject) =>
  resolveCollectionCapability(BLOG_POST_PRESETS.create, subject);

export const canUpdateBlogPost: PolicyCheck<BlogPostRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(BLOG_POST_PRESETS.update, subject, record)
    : { allowed: false };

// The outer gate on the bulk update route -- there is no single record yet
// to check against, so this is the same broad pass the collection search
// route takes, before canUpdateBlogPost narrows per record inside the handler.
export const canUpdateAnyBlogPost: PolicyCheck = (subject) =>
  resolveCollectionCapability(BLOG_POST_PRESETS.update, subject);

// Distinct from canUpdateBlogPost, not an alias of it: being able to edit a
// blogPost's own fields does not automatically mean being able to attach or
// detach whatever this relation points at -- see the relation capabilities
// doctrine. Both default to the same preset today, but each is its own
// PolicyCheck so one can diverge from update later without touching it.
export const canAttachTagsToBlogPost: PolicyCheck<BlogPostRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(BLOG_POST_PRESETS.update, subject, record)
    : { allowed: false };

export const canDetachTagsFromBlogPost: PolicyCheck<BlogPostRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(BLOG_POST_PRESETS.update, subject, record)
    : { allowed: false };

export const canDeleteBlogPost: PolicyCheck<BlogPostRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(BLOG_POST_PRESETS.delete, subject, record)
    : { allowed: false };

// Same reasoning as canUpdateAnyBlogPost, for the bulk delete route.
export const canDeleteAnyBlogPost: PolicyCheck = (subject) =>
  resolveCollectionCapability(BLOG_POST_PRESETS.delete, subject);

// Restore is the inverse of delete, not a kind of update -- whoever can
// delete a record decides whether it comes back, the same way
// canListTrashedBlogPost already derives from the delete preset rather than
// the view preset. Its own capability rather than reusing canDeleteBlogPost
// so a route can diverge later (e.g. restore always requiring 'all' even on
// an 'own'-scoped delete preset).
export const canRestoreBlogPost: PolicyCheck<BlogPostRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(BLOG_POST_PRESETS.delete, subject, record)
    : { allowed: false };

export const canRestoreAnyBlogPost: PolicyCheck = (subject) =>
  resolveCollectionCapability(BLOG_POST_PRESETS.delete, subject);

// Hard delete is not a scope on the delete preset -- own/team/all/none answer
// "whose records", not "how permanently". It is its own admin-only capability,
// checked in addition to (never instead of) the delete preset above.
export const canHardDeleteBlogPost: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };

// Purge has no route today -- only the future admin decorator system reaches
// it -- but it is still gated by its own capability rather than reusing
// canHardDeleteBlogPost, because a route may one day expose it under rules
// stricter than "any admin" (e.g. a second admin's approval).
export const canPurgeBlogPost: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };

export const canViewBlogPost: PolicyCheck<BlogPostRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(BLOG_POST_PRESETS.view, subject, record)
    : { allowed: false };

// Same preset as canViewBlogPost: whoever may read one record may ask for the
// collection, and scopeWhereFor narrows that collection to the very same rows.
export const canViewAnyBlogPost: PolicyCheck = (subject) =>
  resolveCollectionCapability(BLOG_POST_PRESETS.view, subject);

// Listing the bin is a moderation move, so it follows the delete preset rather
// than the read one.
export const canListTrashedBlogPost: PolicyCheck = (subject) =>
  resolveCollectionCapability(BLOG_POST_PRESETS.delete, subject);

@Injectable()
export class BlogPostPolicy {
  constructor(private readonly capabilities: CapabilitiesService) {}

  recordCapabilities(
    subject: CapabilitySubject,
    record: BlogPostRecordLike,
  ): Record<'update' | 'delete', CapabilityDecision> {
    return {
      update: this.capabilities.resolve(
        BLOG_POST_PRESETS.update,
        subject,
        record,
      ),
      delete: this.capabilities.resolve(
        BLOG_POST_PRESETS.delete,
        subject,
        record,
      ),
    };
  }

  metaCapabilities(
    subject: CapabilitySubject,
  ): Record<'create', CapabilityDecision> {
    return {
      create: canCreateBlogPost(subject),
    };
  }
}
