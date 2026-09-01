import { config } from 'dotenv';
import { resolve } from 'path';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/db';

config({ path: resolve(__dirname, '../.env') });

/**
 * Create or update a user with a password.
 *
 * This is how the first admin is bootstrapped -- there is no self-registration.
 *
 *   npm run user:create -- --email you@district.org --name "Your Name" --role admin
 *
 * Omit --password to have one generated and printed once.
 */

const VALID_ROLES = ['admin', 'investigator', 'reporter'] as const;
type Role = (typeof VALID_ROLES)[number];

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('--email')?.toLowerCase();
  const name = arg('--name');
  const role = (arg('--role') ?? 'reporter') as Role;
  let password = arg('--password');

  if (!email || !name) {
    console.error('Usage: npm run user:create -- --email <email> --name <name> [--role admin|investigator|reporter] [--password <password>]');
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Expected one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  let generated = false;
  if (!password) {
    password = randomBytes(12).toString('base64url');
    generated = true;
  }

  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash },
    create: { email, name, role, passwordHash },
  });

  console.log(`\n✅ ${user.email}  (${user.role})  id=${user.id}`);
  if (generated) {
    console.log(`   Generated password: ${password}`);
    console.log('   Store it now — it is not recoverable.\n');
  }
}

main()
  .catch((error) => {
    console.error('Failed to create user:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
