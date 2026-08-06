import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { PublicRoute } from '#technical/capabilities/public-route.decorator';
import { DevOnlyGuard } from '#technical/dev-only/dev-only.guard';
import { ok } from '#technical/http/envelope';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { AUTH_PROVIDER } from './auth.types';
import type { AuthProvider } from './auth.types';
import { loginSchema, registerSchema } from './auth.schemas';
import type { LoginInput, RegisterInput } from './auth.schemas';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  @Post('register')
  @PublicRoute('there is no caller yet: this route is what creates one')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
  ) {
    return ok(await this.authProvider.register(body.email, body.password));
  }

  @Post('login')
  @PublicRoute(
    'there is no caller yet: the credentials in the body are the check',
  )
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    return ok(await this.authProvider.login(body.email, body.password));
  }

  @Post('dev-token')
  @UseGuards(DevOnlyGuard)
  @PublicRoute(
    'mints a caller out of nothing, which is why DevOnlyGuard keeps it out of production',
  )
  async devToken() {
    return ok(await this.authProvider.devToken());
  }
}
