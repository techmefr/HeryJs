import { Body, Controller, Inject, Post } from '@nestjs/common';
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
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) {
    return this.authProvider.register(body.email, body.password);
  }

  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    return this.authProvider.login(body.email, body.password);
  }
}
