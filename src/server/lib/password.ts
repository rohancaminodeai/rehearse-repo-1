import bcrypt from "bcryptjs";

/** bcrypt cost factor (CLAUDE.md rule 6). */
const SALT_ROUNDS = 10;

/** Hash a plaintext password with bcrypt. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Verify a plaintext password against a bcrypt hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
