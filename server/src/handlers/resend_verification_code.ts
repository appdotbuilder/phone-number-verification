import { db } from '../db';
import { usersTable, phoneVerificationsTable } from '../db/schema';
import { type PhoneVerificationResponse } from '../schema';
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

// Utility function to format phone numbers to E.164 format for Twilio
const formatPhoneNumberE164 = (phoneNumber: string): string => {
  const digits = phoneNumber.replace(/\D/g, '');
  if (phoneNumber.startsWith('+')) {
    return phoneNumber; // Already in E.164
  } else if (digits.length === 10) {
    return `+1${digits}`; // Assume US number if 10 digits and no '+'
  }
  // For other cases, prepend '+' assuming it's a valid international number without '+'
  return `+${digits}`; 
};

export const resendVerificationCode = async (userId: number): Promise<PhoneVerificationResponse> => {
  try {
    // 1. Find the user and their latest *unverified* verification attempt
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      return {
        success: false,
        message: "User not found"
      };
    }
    const user = users[0];

    const latestVerification = await db.select()
      .from(phoneVerificationsTable)
      .where(
        and(
          eq(phoneVerificationsTable.user_id, userId),
          eq(phoneVerificationsTable.verified, false) // Only consider unverified attempts
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
    const formattedPhoneNumber = verification.phone_number;

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

    let newVerificationCode: string;
    let newTwilioSid: string | null = verification.twilio_sid;

    if (isTwilioConfigured) {
      // Use Twilio Verify Service to resend
      try {
        const twilioVerification = await twilioClient.verify.v2.services(verifyServiceSid)
          .verifications
          .create({ to: formattedPhoneNumber, channel: 'sms' });

        if (twilioVerification.status === 'pending') {
          newVerificationCode = 'TWILIO_MANAGED';
          newTwilioSid = twilioVerification.sid;
        } else {
          return {
            success: false,
            message: 'Failed to resend Twilio verification code. Status: ' + twilioVerification.status
          };
        }
      } catch (twilioError: any) {
        console.error('Twilio SMS resending failed:', twilioError);
        if (twilioError.status === 429) {
          return {
            success: false,
            message: 'Too many verification attempts. Please wait a few minutes before trying again.'
          };
        }
        return {
          success: false,
          message: 'Failed to resend verification code. Please try again later.'
        };
      }
    } else {
      // Fallback to mock verification for development/testing
      newVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      console.log(`Mock SMS resent to ${formattedPhoneNumber} with code: ${newVerificationCode}`);
    }

    // 3. Update the verification record with new code and reset creation time for cooldown
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // Reset expiration
    const updatedVerification = await db.update(phoneVerificationsTable)
      .set({
        verification_code: newVerificationCode,
        twilio_sid: newTwilioSid,
        created_at: now, // Reset creation time for cooldown tracking
        expires_at: expiresAt
      })
      .where(eq(phoneVerificationsTable.id, verification.id))
      .returning()
      .execute();

    return {
      success: true,
      message: "New verification code sent successfully",
      verification_id: updatedVerification[0].id
    };
  } catch (error) {
    console.error('Resend verification code failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An unknown error occurred during code resend.'
    };
  }
};