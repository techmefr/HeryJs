import { Body, Controller, Inject, Post, UsePipes } from '@nestjs/common';
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
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() body: RegisterInput) {
    return this.authProvider.register(body.email, body.password);
  }

  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: LoginInput) {
    return this.authProvider.login(body.email, body.password);
  }
}
