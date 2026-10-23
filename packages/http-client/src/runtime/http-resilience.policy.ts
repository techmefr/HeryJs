import { operatorAbility, type PolicyCheck } from '#kernel/public/capabilities';

// What a circuit says is which third parties the deployment depends on and how
// they are doing, and what an operator can do to it -- shed a dependency, let
// calls through again, change its thresholds -- changes the behaviour of every
// request that reaches that host. Neither has an own/team/all scope, so both
// ask whether the caller is trusted with something tenant scoping cannot
// contain.
export const canReadHttpCircuits: PolicyCheck = operatorAbility;

export const canManageHttpCircuits: PolicyCheck = operatorAbility;
