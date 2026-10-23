export { CapabilityForbiddenException } from '../errors/capability-forbidden.exception';
export { DomainException } from '../errors/domain.exception';
export {
  InvalidQueryException,
  SoftDeletesNotOfferedException,
} from '../errors/invalid-query.exception';
export {
  InvalidSessionException,
  MissingSessionException,
} from '../errors/invalid-session.exception';
export { RecordNotFoundException } from '../errors/record-not-found.exception';
export { AlreadyRestoredException } from '../errors/already-restored.exception';
export {
  DomainExceptionFilter,
  resolveDomainError,
} from '../errors/domain-exception.filter';
export type { ResolvedError } from '../errors/domain-exception.filter';
export { IllegalTransitionException } from '../errors/illegal-transition.exception';
export { NoCurrentTeamException } from '../errors/no-current-team.exception';
export { VersionConflictException } from '../errors/version-conflict.exception';
