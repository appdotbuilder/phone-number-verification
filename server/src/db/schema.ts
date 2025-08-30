import { serial, text, pgTable, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  first_name: text('first_name').notNull(),
  phone_number: text('phone_number'), // Nullable by default
  phone_verified: boolean('phone_verified').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Phone verifications table
export const phoneVerificationsTable = pgTable('phone_verifications', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  phone_number: text('phone_number').notNull(),
  verification_code: text('verification_code').notNull(),
  twilio_sid: text('twilio_sid'), // Twilio verification service SID, nullable
  verified: boolean('verified').notNull().default(false),
  expires_at: timestamp('expires_at').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Define relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  phoneVerifications: many(phoneVerificationsTable)
}));

export const phoneVerificationsRelations = relations(phoneVerificationsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [phoneVerificationsTable.user_id],
    references: [usersTable.id]
  })
}));

// TypeScript types for the tables
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type PhoneVerification = typeof phoneVerificationsTable.$inferSelect;
export type NewPhoneVerification = typeof phoneVerificationsTable.$inferInsert;

// Export all tables for proper query building
export const tables = { 
  users: usersTable, 
  phoneVerifications: phoneVerificationsTable 
};