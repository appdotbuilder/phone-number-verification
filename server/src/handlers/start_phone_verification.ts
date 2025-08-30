import { db } from '../db';
import { usersTable, phoneVerificationsTable } from '../db/schema';
import { type StartPhoneVerificationInput, type PhoneVerificationResponse } from '../schema';
import { eq, and, desc } from 'drizzle-orm';
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

export const startPhoneVerification = async (input: StartPhoneVerificationInput): Promise<PhoneVerificationResponse> => {
  try {
    // 1. Validate and format phone number early
    const formattedPhoneNumber = formatPhoneNumberE164(input.phone_number);

    // 2. Check if user exists
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

    // 3. Check if user's phone is already verified with this number
    if (user.phone_verified && user.phone_number === formattedPhoneNumber) {
      return {
        success: false,
        message: "Phone number is already verified"
      };
    }

    // 4. Check for existing active verification for this user (spam prevention)
    const now = new Date();
    const activeVerifications = await db.select()
      .from(phoneVerificationsTable)
      .where(
        and(
          eq(phoneVerificationsTable.user_id, input.user_id),
          eq(phoneVerificationsTable.phone_number, formattedPhoneNumber)
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

    let verificationCode: string;
    let twilioSid: string | null = null;

    if (isTwilioConfigured) {
      // Use Twilio Verify Service to send the code
      try {
        const twilioVerification = await twilioClient.verify.v2.services(verifyServiceSid)
          .verifications
          .create({ to: formattedPhoneNumber, channel: 'sms' });

        if (twilioVerification.status === 'pending') {
          verificationCode = 'TWILIO_MANAGED'; // Code is managed by Twilio
          twilioSid = twilioVerification.sid;
        } else {
          return {
            success: false,
            message: 'Failed to initiate Twilio verification. Status: ' + twilioVerification.status
          };
        }
      } catch (twilioError: any) {
        console.error('Twilio SMS sending failed:', twilioError);
        // Handle common Twilio errors like rate limits or invalid numbers
        if (twilioError.status === 400) {
          return {
            success: false,
            message: twilioError.message || 'Invalid phone number or other Twilio error.'
          };
        } else if (twilioError.status === 429) {
          return {
            success: false,
            message: 'Too many verification attempts. Please wait a few minutes before trying again.'
          };
        }
        return {
          success: false,
          message: 'Failed to send verification code. Please try again later.'
        };
      }
    } else {
      // Fallback to mock verification for development/testing
      verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      console.log(`Mock SMS sent to ${formattedPhoneNumber} with code: ${verificationCode}`);
    }

    // 5. Set expiration time for the code (10 minutes from now)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // 6. Store verification record in database
    const verificationResult = await db.insert(phoneVerificationsTable)
      .values({
        user_id: input.user_id,
        phone_number: formattedPhoneNumber,
        verification_code: verificationCode,
        twilio_sid: twilioSid,
        verified: false,
        expires_at: expiresAt
      })
      .returning()
      .execute();

    const verification = verificationResult[0];

    return {
      success: true,
      message: "Verification code sent successfully",
      verification_id: verification.id
    };
  } catch (error) {
    console.error('Phone verification start failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An unknown error occurred during verification start.'
    };
  }
};