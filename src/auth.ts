import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authConfig } from './auth.config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        // Compare against a dummy hash when the user is absent or has no
        // password set, so the response time does not reveal which accounts
        // exist.
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const ok = await bcrypt.compare(password, hash);

        if (!ok || !user?.passwordHash) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});

/**
 * bcrypt hash of a value no password will match; used to equalise timing.
 *
 * **The cost factor must match the one `scripts/create-user.ts` hashes with**
 * (12). This was a `$2a$10$` hash while real hashes are `$2b$12$`, and bcrypt
 * cost is exponential -- 10 is a quarter of the work of 12. So the branch that
 * exists to hide whether an account exists was the *fast* path: measured on
 * this machine, 69ms for an address with no account against 281ms for one with.
 * That is a cleaner enumeration oracle than having no dummy compare at all,
 * because the difference is large, one-sided and stable.
 *
 * If `create-user.ts`'s cost ever changes, change this with it.
 */
const DUMMY_HASH = '$2b$12$r7jWSKZfdEjzJY3bAjyBCOQ5mY2W5qSfhxU/CpNL2YgwL750Ph68K';
