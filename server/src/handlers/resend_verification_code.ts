import { db } from '../db';
import { usersTable, phoneVerificationsTable } from '../db/schema';
import { type PhoneVerificationResponse } from '../schema';
import { eq, desc, and } from 'drizzle-orm';

export const resendVerificationCode = async (userId: number): Promise<PhoneVerificationResponse> => {
  try {
    // 1. Find the user and their latest verification attempt
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (user.length === 0) {
      return {
        success: false,
        message: "User not found"
      };
    }

    // Find the latest unverified phone verification for this user
    const latestVerification = await db.select()
      .from(phoneVerificationsTable)
      .where(
        and(
          eq(phoneVerificationsTable.user_id, userId),
          eq(phoneVerificationsTable.verified, false)
        )
      )
      .orderBy(desc(phoneVerificationsTable.created_at))
      .limit(1)
      .execute();

    if (latestVerification.length === 0) {
      return {
        success: false,
        message: "No pending verification found. Please start a new phone verification."
      };
    }

    const verification = latestVerification[0];

    // 2. Check if enough time has passed since last SMS (1 minute cooldown)
    const now = new Date();
    const timeSinceLastAttempt = now.getTime() - verification.created_at.getTime();
    const cooldownPeriod = 60 * 1000; // 1 minute in milliseconds

    if (timeSinceLastAttempt < cooldownPeriod) {
      const remainingSeconds = Math.ceil((cooldownPeriod - timeSinceLastAttempt) / 1000);
      return {
        success: false,
        message: `Please wait ${remainingSeconds} seconds before requesting a new code`
      };
    }

    // Check if verification has expired
    if (now > verification.expires_at) {
      return {
        success: false,
        message: "Verification has expired. Please start a new phone verification."
      };
    }

    // 3. Generate a new verification code
    const newVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // 4. Send new SMS via Twilio API (simulated for now)
    // In a real implementation, this would call Twilio's API
    console.log(`Sending SMS to ${verification.phone_number}: Your verification code is ${newVerificationCode}`);

    // 5. Update the verification record with new code and reset creation time for cooldown
    const updatedVerification = await db.update(phoneVerificationsTable)
      .set({
        verification_code: newVerificationCode,
        created_at: now // Reset creation time for cooldown tracking
      })
      .where(eq(phoneVerificationsTable.id, verification.id))
      .returning()
      .execute();

    // 6. Return success response
    return {
      success: true,
      message: "New verification code sent successfully",
      verification_id: updatedVerification[0].id
    };
  } catch (error) {
    console.error('Resend verification code failed:', error);
    throw error;
  }
};