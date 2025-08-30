import { db } from '../db';
import { usersTable, phoneVerificationsTable } from '../db/schema';
import { type StartPhoneVerificationInput, type PhoneVerificationResponse } from '../schema';
import { eq, and, desc } from 'drizzle-orm';

export const startPhoneVerification = async (input: StartPhoneVerificationInput): Promise<PhoneVerificationResponse> => {
  try {
    // 1. Check if user exists
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (users.length === 0) {
      return {
        success: false,
        message: "User not found"
      };
    }

    const user = users[0];

    // 2. Check if user's phone is already verified
    if (user.phone_verified && user.phone_number === input.phone_number) {
      return {
        success: false,
        message: "Phone number is already verified"
      };
    }

    // 3. Check for existing active verification for this user
    const now = new Date();
    const activeVerifications = await db.select()
      .from(phoneVerificationsTable)
      .where(
        and(
          eq(phoneVerificationsTable.user_id, input.user_id),
          eq(phoneVerificationsTable.phone_number, input.phone_number)
        )
      )
      .orderBy(desc(phoneVerificationsTable.created_at))
      .limit(1)
      .execute();

    // If there's an active verification within the last 5 minutes, prevent spam
    if (activeVerifications.length > 0) {
      const lastVerification = activeVerifications[0];
      const timeDiff = now.getTime() - lastVerification.created_at.getTime();
      const fiveMinutesInMs = 5 * 60 * 1000;

      if (timeDiff < fiveMinutesInMs && lastVerification.expires_at > now) {
        return {
          success: false,
          message: "Verification code already sent recently. Please wait before requesting another."
        };
      }
    }

    // 4. Generate a 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // 5. Set expiration time (10 minutes from now)
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    // 6. Store verification record in database
    const verificationResult = await db.insert(phoneVerificationsTable)
      .values({
        user_id: input.user_id,
        phone_number: input.phone_number,
        verification_code: verificationCode,
        twilio_sid: null, // In a real implementation, this would be set after Twilio API call
        verified: false,
        expires_at: expiresAt
      })
      .returning()
      .execute();

    const verification = verificationResult[0];

    // 7. In a real implementation, send SMS via Twilio API here
    // For now, we'll simulate successful SMS sending
    console.log(`Simulated SMS sent to ${input.phone_number} with code: ${verificationCode}`);

    return {
      success: true,
      message: "Verification code sent successfully",
      verification_id: verification.id
    };
  } catch (error) {
    console.error('Phone verification start failed:', error);
    throw error;
  }
};