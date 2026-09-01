import { Database } from '../infra/database/database.js';
import { AuthProvider, SignUpEmailInput } from '../modules/auth/auth-provider.js';
import { user } from '../infra/database/auth-schema.js';
import { v7 as uuidv7 } from 'uuid';
import { success } from '../lib/either.js';

export const fakeAuth = (db: Database): AuthProvider => ({
  async signUpEmail(input: SignUpEmailInput) {
    const [row] = await db
      .insert(user)
      .values({ id: uuidv7(), name: input.name, email: input.email })
      .returning();
    return success({ userId: row.id });
  },
  signInEmail: async () => success({ token: 'irrelevant' }),
});
