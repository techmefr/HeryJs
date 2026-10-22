import { unwireModule } from './app-module-patch';

const APP_MODULE = `import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { OAuthModule } from '#modules/oauth/oauth.module';
import { SsoModule } from '#modules/sso/sso.module';
import { ScimModule } from '#modules/scim/scim.module';

@Module({
  imports: [
    AuthModule,
    OAuthModule.forRoot(),
    SsoModule.forRoot(),
    ScimModule,
  ],
})
export class AppModule {}
`;

describe('unwireModule', () => {
  it('removes the import and the entry of a module wired bare', () => {
    const unwired = unwireModule(APP_MODULE, 'scim');

    expect(unwired?.className).toBe('ScimModule');
    expect(unwired?.source).not.toContain('ScimModule');
    expect(unwired?.source).toContain('    SsoModule.forRoot(),\n  ],');
  });

  it('reads the class name from the import, so oauth is OAuthModule', () => {
    const unwired = unwireModule(APP_MODULE, 'oauth');

    expect(unwired?.className).toBe('OAuthModule');
    expect(unwired?.source).not.toContain('OAuthModule');
  });

  it('removes a configured entry as a whole', () => {
    expect(unwireModule(APP_MODULE, 'sso')?.source).not.toContain('SsoModule');
  });

  it('answers undefined for a module AppModule does not import', () => {
    expect(unwireModule(APP_MODULE, 'graphql')).toBeUndefined();
  });
});
