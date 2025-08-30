import { z } from 'zod';

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string(),
  phone_number: z.string().nullable(),
  phone_verified: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Phone verification schema
export const phoneVerificationSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  phone_number: z.string(),
  verification_code: z.string(),
  twilio_sid: z.string().nullable(), // Twilio verification SID
  verified: z.boolean(),
  expires_at: z.coerce.date(),
  created_at: z.coerce.date()
});

export type PhoneVerification = z.infer<typeof phoneVerificationSchema>;

// Input schemas for user operations
export const createUserInputSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1, "First name is required")
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  first_name: z.string().min(1).optional(),
  phone_number: z.string().nullable().optional(),
  phone_verified: z.boolean().optional()
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

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

// E.164 phone number schema with formatting and validation
const e164PhoneNumberSchema = z.string().superRefine((val, ctx) => {
  let formattedNumber: string;
  try {
    formattedNumber = formatPhoneNumberE164(val);
  } catch (e: any) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: e.message,
      path: [],
    });
    return z.NEVER;
  }

  // Basic regex for E.164 format (starts with +, followed by 1 to 15 digits)
  if (!/^\+[1-9]\d{1,14}$/.test(formattedNumber)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Phone number must be in E.164 format (e.g., +1234567890)',
      path: [],
    });
  }
});

// Input schemas for phone verification operations
export const startPhoneVerificationInputSchema = z.object({
  user_id: z.number(),
  phone_number: e164PhoneNumberSchema
});

export type StartPhoneVerificationInput = z.infer<typeof startPhoneVerificationInputSchema>;

export const verifyPhoneCodeInputSchema = z.object({
  user_id: z.number(),
  verification_code: z.string().length(6, "Verification code must be 6 digits")
});

export type VerifyPhoneCodeInput = z.infer<typeof verifyPhoneCodeInputSchema>;

// Response schemas
export const phoneVerificationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  verification_id: z.number().optional()
});

export type PhoneVerificationResponse = z.infer<typeof phoneVerificationResponseSchema>;

export const verifyCodeResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: userSchema.optional()
});

export type VerifyCodeResponse = z.infer<typeof verifyCodeResponseSchema>;