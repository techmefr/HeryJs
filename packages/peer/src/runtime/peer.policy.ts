import { everyone } from '#kernel/capabilities/ability';
import type { PolicyCheck } from '#kernel/capabilities/capability-check';

/**
 * A peer room is not a generated resource with an owner column and presets of
 * its own -- it is named by whatever the application decides a room is (a
 * call, a support ticket, a meeting). So, unlike a generated `canViewX`, this
 * module cannot resolve `own`/`team` against a record it has no loader for.
 *
 * What it ships is the permissive default every signed-in caller starts from,
 * written with `ability`/`everyone` exactly like the kernel's own
 * non-resource capabilities (`canManagePrune`, `canIssueSignalToken`) -- one
 * `PolicyCheck`, not a second authorization system. An application that needs
 * real room membership rules replaces these two exports with its own
 * `PolicyCheck`s (e.g. checking the caller against a Room record it owns);
 * the gateway only ever calls `canJoinPeerRoom`/`canViewPeerRoomParticipants`
 * by name, so swapping the implementation is a one-file change.
 */
export const canJoinPeerRoom: PolicyCheck = everyone('all');

export const canViewPeerRoomParticipants: PolicyCheck = everyone('all');
