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

// Input schemas for phone verification operations
export const startPhoneVerificationInputSchema = z.object({
  user_id: z.number(),
  phone_number: z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g., +1234567890)")
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