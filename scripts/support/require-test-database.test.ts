import { afterEach, describe, expect, it } from 'vitest';
import { requireTestDatabase } from './require-test-database';

const original = process.env.DATABASE_URL;

afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = original;
});

function guard(url: string | undefined) {
  if (url === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = url;
  return () => requireTestDatabase('scripts/example.ts');
}

describe('requireTestDatabase', () => {
  it('allows a database whose name contains test', () => {
    expect(guard('postgresql://u@localhost:5432/generalschat_test?schema=public')).not.toThrow();
  });

  it('allows a dev database on loopback, which is what a local checkout has', () => {
    expect(guard('postgresql://u@localhost:5432/generalschat_dev?schema=public')).not.toThrow();
    expect(guard('postgresql://u@127.0.0.1:5432/generalschat_dev')).not.toThrow();
  });

  it('refuses a hosted database even when its name says dev', () => {
    expect(guard('postgresql://u:p@db.prisma.io:5432/generalschat_dev')).toThrow(/refusing to run/);
  });

  it('refuses a local database that is neither test nor dev', () => {
    expect(guard('postgresql://u@localhost:5432/generalschat')).toThrow(/refusing to run/);
  });

  it('does not read dev out of the credentials or the host', () => {
    expect(guard('postgresql://dev:dev@db.example.com:5432/generalschat')).toThrow(/refusing to run/);
    expect(guard('postgresql://u@dev.example.com:5432/generalschat')).toThrow(/refusing to run/);
  });

  it('refuses rather than guesses when DATABASE_URL is unset', () => {
    expect(guard(undefined)).toThrow(/DATABASE_URL is not set/);
  });

  it('keeps the password out of the refusal, which reaches terminals and CI logs', () => {
    expect(guard('postgresql://user:hunter2@db.prisma.io:5432/generalschat')).toThrow(/:\*\*\*@/);
    expect(guard('postgresql://user:hunter2@db.prisma.io:5432/generalschat')).not.toThrow(/hunter2/);
  });
});
