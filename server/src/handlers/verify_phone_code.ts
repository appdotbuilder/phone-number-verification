import { db } from '../db';
import { phoneVerificationsTable, usersTable } from '../db/schema';
import { type VerifyPhoneCodeInput, type VerifyCodeResponse } from '../schema';
import { eq, desc, and } from 'drizzle-orm';
import twilio from 'twilio';

// Twilio configuration
const accountSid = process.env['TWILIO_ACCOUNT_SID'];
const authToken = process.env['TWILIO_AUTH_TOKEN'];
const verifyServiceSid = process.env['TWILIO_VERIFY_SERVICE_SID'];

let twilioClient: any = null;
const isTwilioConfigured = accountSid && authToken && verifyServiceSid;

if (isTwilioConfigured) {
  twilioClient = twilio(accountSid, authToken);
} else {
  console.error('Missing Twilio environment variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID');
  console.log('Falling back to mock verification for development/testing');
}

export const verifyPhoneCode = async (input: VerifyPhoneCodeInput): Promise<VerifyCodeResponse> => {
  try {
    // 1. Find the latest verification record for the user (including verified ones to check status)
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

    // Check if the local expiration has passed (Twilio has its own, but this provides a client-side hint)
    const now = new Date();
    if (verification.expires_at < now) {
      return {
        success: false,
        message: "Verification code has expired. Please request a new code."
      };
    }

    // Check if verification has already been completed
    if (verification.verified) {
      return {
        success: false,
        message: "This verification code has already been used."
      };
    }

    let isCodeValid = false;

    if (isTwilioConfigured && verification.twilio_sid) {
      // 2. Use Twilio Verify Service to check the code
      try {
        const twilioCheck = await twilioClient.verify.v2.services(verifyServiceSid)
          .verificationChecks
          .create({
            code: input.verification_code,
            to: verification.phone_number
          });

        isCodeValid = twilioCheck.status === 'approved';
      } catch (twilioError: any) {
        console.error('Twilio code verification failed:', twilioError);
        return {
          success: false,
          message: 'Failed to verify code with Twilio. Please try again.'
        };
      }
    } else {
      // Fallback to local verification for development/testing
      isCodeValid = verification.verification_code === input.verification_code;
    }

    if (isCodeValid) {
      // 3. Mark the verification as complete in our database
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
    } else {
      return {
        success: false,
        message: "Invalid verification code. Please try again."
      };
    }

  } catch (error) {
    console.error('Phone verification failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An unknown error occurred during code verification.'
    };
  }
};