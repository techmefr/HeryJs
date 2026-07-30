import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { DevOnlyGuard } from '../dev-only/dev-only.guard';
import { ok } from '../http/envelope';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
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
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
  ) {
    return ok(await this.authProvider.register(body.email, body.password));
  }

  @Post('login')
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    return ok(await this.authProvider.login(body.email, body.password));
  }

  @Post('dev-token')
  @UseGuards(DevOnlyGuard)
  async devToken() {
    return ok(await this.authProvider.devToken());
  }
}
