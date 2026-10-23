import * as path from 'node:path';
import { checkSubjectConstruction as checkSubjects } from '@heryjs/core/conventions';

const ALLOWED_FILES = new Map([
  [
    'src/technical/capabilities/subject.ts',
    'the sanctioned builder, the one place a subject is assembled',
  ],
  [
    'src/technical/auth/session-auth.provider.ts',
    'assembles the session from the database, which is what the subject derives from',
  ],
]);

export function checkSubjectConstruction(): boolean {
  return checkSubjects(path.resolve(__dirname, '..'), ALLOWED_FILES);
}
