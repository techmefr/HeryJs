import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { json } from 'express';
import { AuthModule } from '#technical/auth/auth.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { PrismaScimDirectoryStore } from './prisma-scim-directory.store';
import { PrismaScimTokenStore } from './prisma-scim-token.store';
import { ScimActivityService } from './scim-activity.service';
import { ScimAdminController } from './scim-admin.controller';
import { ScimGroupsService } from './scim-groups.service';
import { ScimTokenGuard } from './scim-token.guard';
import { ScimTokenService } from './scim-token.service';
import { ScimUsersService } from './scim-users.service';
import { ScimController } from './scim.controller';
import {
  SCIM_BASE_PATH,
  SCIM_CONTENT_TYPE,
  SCIM_DIRECTORY_STORE,
  SCIM_TOKEN_STORE,
} from './scim.types';

const SCIM_BODY_LIMIT = '1mb';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ScimController, ScimAdminController],
  providers: [
    { provide: SCIM_TOKEN_STORE, useClass: PrismaScimTokenStore },
    { provide: SCIM_DIRECTORY_STORE, useClass: PrismaScimDirectoryStore },
    ScimTokenService,
    ScimTokenGuard,
    ScimUsersService,
    ScimGroupsService,
    ScimActivityService,
  ],
  exports: [ScimTokenService],
})
export class ScimModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(json({ type: SCIM_CONTENT_TYPE, limit: SCIM_BODY_LIMIT }))
      .forRoutes(`${SCIM_BASE_PATH}/*path`);
  }
}
