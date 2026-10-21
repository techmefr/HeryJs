import { Injectable } from '@nestjs/common';
import { getAuthContext } from './better-auth.instance';
import { InvalidCurrentPasswordException } from '#technical/errors/invalid-current-password.exception';

const INVALID_PASSWORD_CODE = 'INVALID_PASSWORD';

@Injectable()
export class PasswordService {
  async change(
    bearer: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ token: string | null }> {
    const { auth, APIError } = await getAuthContext();

    try {
      const result = await auth.api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: true },
        headers: new Headers({ authorization: `Bearer ${bearer}` }),
      });
      return { token: result.token };
    } catch (error) {
      if (
        error instanceof APIError &&
        error.body?.code === INVALID_PASSWORD_CODE
      ) {
        throw new InvalidCurrentPasswordException();
      }
      throw error;
    }
  }
}
