import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, phoneVerificationsTable } from '../db/schema';
import { type VerifyPhoneCodeInput } from '../schema';
import { verifyPhoneCode } from '../handlers/verify_phone_code';
import { eq } from 'drizzle-orm';

describe('verifyPhoneCode', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test user
  const createTestUser = async () => {
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        first_name: 'Test User'
      })
      .returning()
      .execute();
    return userResult[0];
  };

  // Helper function to create test verification
  const createTestVerification = async (userId: number, options: {
    code?: string;
    phoneNumber?: string;
    verified?: boolean;
    expiresAt?: Date;
  } = {}) => {
    const defaultExpiry = new Date();
    defaultExpiry.setMinutes(defaultExpiry.getMinutes() + 10); // 10 minutes from now

    const verificationResult = await db.insert(phoneVerificationsTable)
      .values({
        user_id: userId,
        phone_number: options.phoneNumber || '+1234567890',
        verification_code: options.code || '123456',
        verified: options.verified || false,
        expires_at: options.expiresAt || defaultExpiry
      })
      .returning()
      .execute();
    return verificationResult[0];
  };

  it('should verify phone code successfully', async () => {
    // Create test user and verification
    const user = await createTestUser();
    await createTestVerification(user.id, { 
      code: '123456',
      phoneNumber: '+1234567890'
    });

    const input: VerifyPhoneCodeInput = {
      user_id: user.id,
      verification_code: '123456'
    };

    const result = await verifyPhoneCode(input);

    // Verify success response
    expect(result.success).toBe(true);
    expect(result.message).toEqual('Phone number verified successfully.');
    expect(result.user).toBeDefined();
    expect(result.user?.phone_number).toEqual('+1234567890');
    expect(result.user?.phone_verified).toBe(true);
    expect(result.user?.updated_at).toBeInstanceOf(Date);
  });

  it('should update user phone fields in database', async () => {
    const user = await createTestUser();
    await createTestVerification(user.id, { 
      code: '123456',
      phoneNumber: '+1987654321'
    });

    const input: VerifyPhoneCodeInput = {
      user_id: user.id,
      verification_code: '123456'
    };

    await verifyPhoneCode(input);

    // Check user was updated in database
    const updatedUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .execute();

    const updatedUser = updatedUsers[0];
    expect(updatedUser.phone_number).toEqual('+1987654321');
    expect(updatedUser.phone_verified).toBe(true);
    expect(updatedUser.updated_at).toBeInstanceOf(Date);
  });

  it('should mark verification as completed in database', async () => {
    const user = await createTestUser();
    const verification = await createTestVerification(user.id, { code: '123456' });

    const input: VerifyPhoneCodeInput = {
      user_id: user.id,
      verification_code: '123456'
    };

    await verifyPhoneCode(input);

    // Check verification was marked as verified
    const updatedVerifications = await db.select()
      .from(phoneVerificationsTable)
      .where(eq(phoneVerificationsTable.id, verification.id))
      .execute();

    expect(updatedVerifications[0].verified).toBe(true);
  });

  it('should reject invalid verification code', async () => {
    const user = await createTestUser();
    await createTestVerification(user.id, { code: '123456' });

    const input: VerifyPhoneCodeInput = {
      user_id: user.id,
      verification_code: '999999' // Wrong code
    };

    const result = await verifyPhoneCode(input);

    expect(result.success).toBe(false);
    expect(result.message).toEqual('Invalid verification code. Please try again.');
    expect(result.user).toBeUndefined();
  });

  it('should reject expired verification code', async () => {
    const user = await createTestUser();
    
    // Create verification that expired 5 minutes ago
    const expiredDate = new Date();
    expiredDate.setMinutes(expiredDate.getMinutes() - 5);
    
    await createTestVerification(user.id, { 
      code: '123456',
      expiresAt: expiredDate
    });

    const input: VerifyPhoneCodeInput = {
      user_id: user.id,
      verification_code: '123456'
    };

    const result = await verifyPhoneCode(input);

    expect(result.success).toBe(false);
    expect(result.message).toEqual('Verification code has expired. Please request a new code.');
    expect(result.user).toBeUndefined();
  });

  it('should reject already verified code', async () => {
    const user = await createTestUser();
    await createTestVerification(user.id, { 
      code: '123456',
      verified: true // Already verified
    });

    const input: VerifyPhoneCodeInput = {
      user_id: user.id,
      verification_code: '123456'
    };

    const result = await verifyPhoneCode(input);

    expect(result.success).toBe(false);
    expect(result.message).toEqual('This verification code has already been used.');
    expect(result.user).toBeUndefined();
  });

  it('should handle user with no verification records', async () => {
    const user = await createTestUser();
    // No verification record created

    const input: VerifyPhoneCodeInput = {
      user_id: user.id,
      verification_code: '123456'
    };

    const result = await verifyPhoneCode(input);

    expect(result.success).toBe(false);
    expect(result.message).toEqual('No phone verification found. Please start the verification process first.');
    expect(result.user).toBeUndefined();
  });

  it('should use the latest verification record when multiple exist', async () => {
    const user = await createTestUser();
    
    // Create older verification (should be ignored)
    await createTestVerification(user.id, { 
      code: '111111',
      phoneNumber: '+1111111111'
    });

    // Wait a moment to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    // Create newer verification (should be used)
    await createTestVerification(user.id, { 
      code: '222222',
      phoneNumber: '+2222222222'
    });

    const input: VerifyPhoneCodeInput = {
      user_id: user.id,
      verification_code: '222222' // Use code from newer verification
    };

    const result = await verifyPhoneCode(input);

    expect(result.success).toBe(true);
    expect(result.user?.phone_number).toEqual('+2222222222'); // Should use phone from newer verification
  });

  it('should handle non-existent user gracefully', async () => {
    const input: VerifyPhoneCodeInput = {
      user_id: 99999, // Non-existent user ID
      verification_code: '123456'
    };

    const result = await verifyPhoneCode(input);

    expect(result.success).toBe(false);
    expect(result.message).toEqual('No phone verification found. Please start the verification process first.');
    expect(result.user).toBeUndefined();
  });
});