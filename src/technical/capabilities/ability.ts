import type { PolicyCheck } from './capability-check';
import type { CapabilityScope, CapabilitySubject } from './capabilities.types';

/**
 * A capability that is not about a resource: opening the metrics page, running
 * a prune, seeding an agency, reading the audit log. It answers "may this
 * caller do this at all", never "on whose rows", so it never receives a record
 * and its scope is a property of the capability rather than of the row.
 *
 * The mechanism is the same PolicyCheck a generated resource policy uses --
 * this is naming the shape, not adding a second authorization system. Eleven
 * of these were written by hand across the kernel and its modules, nine of
 * them the identical admin-or-nothing ternary, which is exactly the kind of
 * repetition that drifts: one of them eventually grows an extra condition and
 * nothing says whether that was deliberate.
 */
export function ability(
  isAllowed: (subject: CapabilitySubject) => boolean,
  scope: CapabilityScope = 'all',
): PolicyCheck {
  return (subject) =>
    isAllowed(subject) ? { allowed: true, scope } : { allowed: false };
}

/**
 * The most common one by far, and the reason it is a named export rather than
 * an inlined predicate: "trusted with something tenant scoping cannot contain"
 * is a single decision, and it should read the same everywhere it is made.
 */
export const adminAbility: PolicyCheck = ability(
  (subject) => subject.role === 'admin',
);

/**
 * Allowed for every signed-in caller, bounded by scope rather than by role --
 * a perimeter everyone is inside of, where the question that remains is whose
 * rows, not whether.
 */
export function everyone(scope: CapabilityScope): PolicyCheck {
  return ability(() => true, scope);
}
