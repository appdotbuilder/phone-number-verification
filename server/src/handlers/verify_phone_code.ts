import { db } from '../db';
import { phoneVerificationsTable, usersTable } from '../db/schema';
import { type VerifyPhoneCodeInput, type VerifyCodeResponse } from '../schema';
import { eq, desc, and } from 'drizzle-orm';

export const verifyPhoneCode = async (input: VerifyPhoneCodeInput): Promise<VerifyCodeResponse> => {
  try {
    // 1. Find the latest verification record for the user
    const verificationRecords = await db.select()
      .from(phoneVerificationsTable)
      .where(eq(phoneVerificationsTable.user_id, input.user_id))
      .orderBy(desc(phoneVerificationsTable.created_at))
      .limit(1)
      .execute();

    if (verificationRecords.length === 0) {
      return {
        success: false,
        message: "No phone verification found. Please start the verification process first."
      };
    }

    const verification = verificationRecords[0];

    // 2. Check if the verification code matches and hasn't expired
    const now = new Date();
    const isExpired = verification.expires_at < now;
    const isCodeValid = verification.verification_code === input.verification_code;
    const isAlreadyVerified = verification.verified;

    if (isExpired) {
      return {
        success: false,
        message: "Verification code has expired. Please request a new code."
      };
    }

    if (isAlreadyVerified) {
      return {
        success: false,
        message: "This verification code has already been used."
      };
    }

    if (!isCodeValid) {
      return {
        success: false,
        message: "Invalid verification code. Please try again."
      };
    }

    // 3. Mark the verification as complete
    await db.update(phoneVerificationsTable)
      .set({ verified: true })
      .where(eq(phoneVerificationsTable.id, verification.id))
      .execute();

    // 4. Update the user's phone_number and phone_verified fields
    const updatedUsers = await db.update(usersTable)
      .set({ 
        phone_number: verification.phone_number,
        phone_verified: true,
        updated_at: now
      })
      .where(eq(usersTable.id, input.user_id))
      .returning()
      .execute();

    const updatedUser = updatedUsers[0];

    // 5. Return success response with updated user data
    return {
      success: true,
      message: "Phone number verified successfully.",
      user: updatedUser
    };

  } catch (error) {
    console.error('Phone verification failed:', error);
    throw error;
  }
};