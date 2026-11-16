import { eq, or } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';

export interface UpsertUserInput {
  uid: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: string;
  language?: string;
  parentalConsent?: boolean;
}

export async function findUserByContact(contact: string) {
  const normalized = contact.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await db
    .select()
    .from(users)
    .where(or(eq(users.email, normalized), eq(users.phone, normalized)));
  return rows[0] ?? null;
}

export async function getOrCreateUser(input: UpsertUserInput) {
  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, input.uid));
    if (existing.length > 0) {
      return existing[0];
    }

    const inserted = await db
      .insert(users)
      .values({
        uid: input.uid,
        email: input.email ?? '',
        phone: input.phone ?? '',
        firstName: input.firstName ?? '',
        lastName: input.lastName ?? '',
        birthDate: input.birthDate ?? '2000-01-01',
        gender: input.gender ?? 'unspecified',
        language: input.language ?? 'ru',
        parentalConsent: input.parentalConsent ?? false,
      })
      .onConflictDoNothing({ target: users.uid })
      .returning();

    if (inserted.length > 0) {
      return inserted[0];
    }

    const afterConflict = await db
      .select()
      .from(users)
      .where(eq(users.uid, input.uid));
    return afterConflict[0];
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Failed to load or register user.', { cause: error });
  }
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<{
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: string;
    language: string;
    parentalConsent: boolean;
    plan: string;
    planExpiresAt: Date | null;
    planAutoRenew: boolean;
    dailyAiCount: number;
    dailyAiDate: string;
  }>,
) {
  try {
    const updated = await db
      .update(users)
      .set(patch)
      .where(eq(users.uid, uid))
      .returning();
    return updated[0] ?? null;
  } catch (error) {
    console.error('Database error in updateUserProfile:', error);
    throw new Error('Failed to update user profile.', { cause: error });
  }
}
