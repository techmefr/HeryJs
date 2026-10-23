import type { PolicyCheck } from '#kernel/public/capabilities';

// An upload has no record to own until whatever the caller does next attaches
// the returned key to one -- the tenant boundary and the gates in
// StorageService are what carry weight here, not a scope, so this is a
// trivial "any authenticated caller" decision like canManageOwnApiKeys.
export const canUploadFiles: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
