import type { HeryModuleContract } from '@heryjs/core/modules';
import exportHeryModule from '#modules/export/export.hery';
import impersonationHeryModule from '#modules/impersonation/impersonation.hery';
import mailHeryModule from '#modules/mail/mail.hery';
import oauthHeryModule from '#modules/oauth/oauth.hery';
import scimHeryModule from '#modules/scim/scim.hery';
import sseHeryModule from '#modules/sse/sse.hery';
import ssoHeryModule from '#modules/sso/sso.hery';
import storageHeryModule from '#modules/storage/storage.hery';
import webhooksHeryModule from '#modules/webhooks/webhooks.hery';

export const heryModules: HeryModuleContract[] = [
  exportHeryModule,
  impersonationHeryModule,
  mailHeryModule,
  oauthHeryModule,
  scimHeryModule,
  sseHeryModule,
  ssoHeryModule,
  storageHeryModule,
  webhooksHeryModule,
];
