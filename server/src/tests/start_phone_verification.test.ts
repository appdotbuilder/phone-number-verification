import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, phoneVerificationsTable } from '../db/schema';
import { type StartPhoneVerificationInput } from '../schema';
import { startPhoneVerification } from '../handlers/start_phone_verification';
import { eq, and } from 'drizzle-orm';

describe('startPhoneVerification', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create a test user
  const createTestUser = async (phoneVerified = false, phoneNumber: string | null = null, email?: string) => {
    const timestamp = Date.now();
    const result = await db.insert(usersTable)
      .values({
        email: email || `test${timestamp}${Math.random().toString(36)}@example.com`,
        first_name: 'Test',
        phone_number: phoneNumber,
        phone_verified: phoneVerified
      })
      .returning()
      .execute();
    return result[0];
  };

  const validInput: StartPhoneVerificationInput = {
    user_id: 1,
    phone_number: '+1234567890'
  };

  it('should start phone verification for valid user', async () => {
    // Create test user
    const user = await createTestUser();
    const input = { ...validInput, user_id: user.id };

    const result = await startPhoneVerification(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Verification code sent successfully');
    expect(result.verification_id).toBeDefined();
    expect(typeof result.verification_id).toBe('number');
  });

  it('should create verification record in database', async () => {
    // Create test user
    const user = await createTestUser();
    const input = { ...validInput, user_id: user.id };

    const result = await startPhoneVerification(input);

    // Verify record was created
    const verifications = await db.select()
      .from(phoneVerificationsTable)
      .where(eq(phoneVerificationsTable.id, result.verification_id!))
      .execute();

    expect(verifications).toHaveLength(1);
    
    const verification = verifications[0];
    expect(verification.user_id).toBe(user.id);
    expect(verification.phone_number).toBe(input.phone_number);
    expect(verification.verification_code).toMatch(/^\d{6}$/); // 6-digit code
    expect(verification.verified).toBe(false);
    expect(verification.expires_at).toBeInstanceOf(Date);
    expect(verification.created_at).toBeInstanceOf(Date);
    
    // Verify expiration is ~10 minutes from now
    const now = new Date();
    const timeDiff = verification.expires_at.getTime() - now.getTime();
    expect(timeDiff).toBeGreaterThan(9 * 60 * 1000); // At least 9 minutes
    expect(timeDiff).toBeLessThan(11 * 60 * 1000); // At most 11 minutes
  });

  it('should fail for non-existent user', async () => {
    const input = { ...validInput, user_id: 999999 };

    const result = await startPhoneVerification(input);

    expect(result.success).toBe(false);
    expect(result.message).toBe('User not found');
    expect(result.verification_id).toBeUndefined();
  });

  it('should fail if phone number is already verified', async () => {
    const phoneNumber = '+1234567890';
    // Create user with already verified phone
    const user = await createTestUser(true, phoneNumber);
    const input = { ...validInput, user_id: user.id, phone_number: phoneNumber };

    const result = await startPhoneVerification(input);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Phone number is already verified');
    expect(result.verification_id).toBeUndefined();
  });

  it('should allow verification for different phone number even if user has verified phone', async () => {
    const oldPhoneNumber = '+1111111111';
    const newPhoneNumber = '+2222222222';
    
    // Create user with verified phone
    const user = await createTestUser(true, oldPhoneNumber);
    const input = { ...validInput, user_id: user.id, phone_number: newPhoneNumber };

    const result = await startPhoneVerification(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Verification code sent successfully');
    expect(result.verification_id).toBeDefined();
  });

  it('should prevent spam by blocking requests within 5 minutes', async () => {
    // Create test user
    const user = await createTestUser();
    const input = { ...validInput, user_id: user.id };

    // First request should succeed
    const firstResult = await startPhoneVerification(input);
    expect(firstResult.success).toBe(true);

    // Second request within 5 minutes should fail
    const secondResult = await startPhoneVerification(input);
    expect(secondResult.success).toBe(false);
    expect(secondResult.message).toMatch(/already sent recently/i);
    expect(secondResult.verification_id).toBeUndefined();
  });

  it('should allow new verification after previous one expires', async () => {
    // Create test user
    const user = await createTestUser();
    const input = { ...validInput, user_id: user.id };

    // Create an expired verification manually
    const pastTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
    await db.insert(phoneVerificationsTable)
      .values({
        user_id: user.id,
        phone_number: input.phone_number,
        verification_code: '123456',
        twilio_sid: null,
        verified: false,
        expires_at: pastTime, // Already expired
        created_at: pastTime
      })
      .execute();

    // New verification should be allowed
    const result = await startPhoneVerification(input);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Verification code sent successfully');
    expect(result.verification_id).toBeDefined();
  });

  it('should generate unique 6-digit codes', async () => {
    // Create multiple test users
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    
    const input1 = { ...validInput, user_id: user1.id, phone_number: '+1111111111' };
    const input2 = { ...validInput, user_id: user2.id, phone_number: '+2222222222' };

    const result1 = await startPhoneVerification(input1);
    const result2 = await startPhoneVerification(input2);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    // Get both verification codes
    const verification1 = await db.select()
      .from(phoneVerificationsTable)
      .where(eq(phoneVerificationsTable.id, result1.verification_id!))
      .execute();
    
    const verification2 = await db.select()
      .from(phoneVerificationsTable)
      .where(eq(phoneVerificationsTable.id, result2.verification_id!))
      .execute();

    const code1 = verification1[0].verification_code;
    const code2 = verification2[0].verification_code;

    // Both should be 6-digit codes
    expect(code1).toMatch(/^\d{6}$/);
    expect(code2).toMatch(/^\d{6}$/);
    
    // Codes should be different (very high probability)
    expect(code1).not.toBe(code2);
  });

  it('should handle different phone number formats correctly', async () => {
    const user = await createTestUser();
    const phoneNumbers = [
      '+1234567890',
      '+44123456789',
      '+861234567890'
    ];

    for (const phoneNumber of phoneNumbers) {
      const input = { user_id: user.id, phone_number: phoneNumber };
      const result = await startPhoneVerification(input);

      expect(result.success).toBe(true);
      expect(result.verification_id).toBeDefined();

      // Verify the phone number was stored correctly
      const verification = await db.select()
        .from(phoneVerificationsTable)
        .where(eq(phoneVerificationsTable.id, result.verification_id!))
        .execute();

      expect(verification[0].phone_number).toBe(phoneNumber);
    }
  });
});