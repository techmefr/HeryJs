import { Global, Module, OnModuleInit } from '@nestjs/common';
import { defaultKeyring } from './default-keyring';
import { hasEncryptedColumns } from './encrypted-columns';
import { SecretsService } from './secrets.service';

@Global()
@Module({
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretsModule implements OnModuleInit {
  onModuleInit(): void {
    if (hasEncryptedColumns()) {
      defaultKeyring();
    }
  }
}
