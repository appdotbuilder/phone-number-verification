import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, phoneVerificationsTable } from '../db/schema';
import { resendVerificationCode } from '../handlers/resend_verification_code';
import { eq } from 'drizzle-orm';

describe('resendVerificationCode', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should successfully resend verification code', async () => {
    // Create a test user
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        first_name: 'Test',
        phone_number: '+1234567890',
        phone_verified: false
      })
      .returning()
      .execute();

    const user = users[0];

    // Create an initial verification (simulate it was created more than 1 minute ago)
    const pastTime = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
    const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    const verifications = await db.insert(phoneVerificationsTable)
      .values({
        user_id: user.id,
        phone_number: '+1234567890',
        verification_code: '123456',
        twilio_sid: null,
        verified: false,
        expires_at: futureTime,
        created_at: pastTime
      })
      .returning()
      .execute();

    const originalVerification = verifications[0];

    // Test resending verification code
    const result = await resendVerificationCode(user.id);

    expect(result.success).toBe(true);
    expect(result.message).toBe('New verification code sent successfully');
    expect(result.verification_id).toBe(originalVerification.id);

    // Verify the verification code was updated
    const updatedVerifications = await db.select()
      .from(phoneVerificationsTable)
      .where(eq(phoneVerificationsTable.id, originalVerification.id))
      .execute();

    const updatedVerification = updatedVerifications[0];
    expect(updatedVerification.verification_code).not.toBe('123456');
    expect(updatedVerification.verification_code).toMatch(/^\d{6}$/);
    expect(updatedVerification.created_at.getTime()).toBeGreaterThan(pastTime.getTime());
  });

  it('should reject resend request within cooldown period', async () => {
    // Create a test user
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        first_name: 'Test',
        phone_number: '+1234567890',
        phone_verified: false
      })
      .returning()
      .execute();

    const user = users[0];

    // Create a recent verification (within cooldown period)
    const recentTime = new Date(Date.now() - 30 * 1000); // 30 seconds ago
    const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    await db.insert(phoneVerificationsTable)
      .values({
        user_id: user.id,
        phone_number: '+1234567890',
        verification_code: '123456',
        twilio_sid: null,
        verified: false,
        expires_at: futureTime,
        created_at: recentTime
      })
      .execute();

    // Test resending verification code within cooldown
    const result = await resendVerificationCode(user.id);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Please wait \d+ seconds before requesting a new code/);
    expect(result.verification_id).toBeUndefined();
  });

  it('should return error for non-existent user', async () => {
    const result = await resendVerificationCode(999);

    expect(result.success).toBe(false);
    expect(result.message).toBe('User not found');
    expect(result.verification_id).toBeUndefined();
  });

  it('should return error when no pending verification exists', async () => {
    // Create a test user
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        first_name: 'Test',
        phone_number: null,
        phone_verified: false
      })
      .returning()
      .execute();

    const user = users[0];

    // Test resending when no verification exists
    const result = await resendVerificationCode(user.id);

    expect(result.success).toBe(false);
    expect(result.message).toBe('No pending verification found. Please start a new phone verification.');
    expect(result.verification_id).toBeUndefined();
  });

  it('should return error when verification has expired', async () => {
    // Create a test user
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        first_name: 'Test',
        phone_number: '+1234567890',
        phone_verified: false
      })
      .returning()
      .execute();

    const user = users[0];

    // Create an expired verification
    const pastTime = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
    const expiredTime = new Date(Date.now() - 1 * 60 * 1000); // 1 minute ago (expired)

    await db.insert(phoneVerificationsTable)
      .values({
        user_id: user.id,
        phone_number: '+1234567890',
        verification_code: '123456',
        twilio_sid: null,
        verified: false,
        expires_at: expiredTime,
        created_at: pastTime
      })
      .execute();

    // Test resending verification code for expired verification
    const result = await resendVerificationCode(user.id);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Verification has expired. Please start a new phone verification.');
    expect(result.verification_id).toBeUndefined();
  });

  it('should ignore already verified verification records', async () => {
    // Create a test user
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        first_name: 'Test',
        phone_number: '+1234567890',
        phone_verified: true
      })
      .returning()
      .execute();

    const user = users[0];

    // Create a verified verification record (should be ignored)
    const pastTime = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
    const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    await db.insert(phoneVerificationsTable)
      .values({
        user_id: user.id,
        phone_number: '+1234567890',
        verification_code: '123456',
        twilio_sid: null,
        verified: true, // Already verified
        expires_at: futureTime,
        created_at: pastTime
      })
      .execute();

    // Test resending - should not find any unverified records
    const result = await resendVerificationCode(user.id);

    expect(result.success).toBe(false);
    expect(result.message).toBe('No pending verification found. Please start a new phone verification.');
    expect(result.verification_id).toBeUndefined();
  });

  it('should use latest unverified verification when multiple exist', async () => {
    // Create a test user
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        first_name: 'Test',
        phone_number: '+1234567890',
        phone_verified: false
      })
      .returning()
      .execute();

    const user = users[0];

    // Create multiple verification records
    const pastTime1 = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
    const pastTime2 = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago (latest)
    const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Older verification
    await db.insert(phoneVerificationsTable)
      .values({
        user_id: user.id,
        phone_number: '+1234567890',
        verification_code: '111111',
        twilio_sid: null,
        verified: false,
        expires_at: futureTime,
        created_at: pastTime1
      })
      .execute();

    // Latest verification
    const latestVerifications = await db.insert(phoneVerificationsTable)
      .values({
        user_id: user.id,
        phone_number: '+1234567890',
        verification_code: '222222',
        twilio_sid: null,
        verified: false,
        expires_at: futureTime,
        created_at: pastTime2
      })
      .returning()
      .execute();

    const latestVerification = latestVerifications[0];

    // Test resending - should use the latest verification
    const result = await resendVerificationCode(user.id);

    expect(result.success).toBe(true);
    expect(result.message).toBe('New verification code sent successfully');
    expect(result.verification_id).toBe(latestVerification.id);

    // Verify the latest verification was updated, not the older one
    const updatedVerifications = await db.select()
      .from(phoneVerificationsTable)
      .where(eq(phoneVerificationsTable.id, latestVerification.id))
      .execute();

    const updatedVerification = updatedVerifications[0];
    expect(updatedVerification.verification_code).not.toBe('222222');
    expect(updatedVerification.verification_code).toMatch(/^\d{6}$/);
  });
});