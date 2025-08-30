import { db } from '../db';
import { usersTable } from '../db/schema';
import { type UpdateUserInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

export const updateUser = async (input: UpdateUserInput): Promise<User | null> => {
  try {
    // First check if user exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.id))
      .execute();

    if (existingUser.length === 0) {
      return null;
    }

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date() // Always update the timestamp
    };

    if (input.email !== undefined) {
      updateData.email = input.email;
    }

    if (input.first_name !== undefined) {
      updateData.first_name = input.first_name;
    }

    if (input.phone_number !== undefined) {
      updateData.phone_number = input.phone_number;
    }

    if (input.phone_verified !== undefined) {
      updateData.phone_verified = input.phone_verified;
    }

    // Perform the update
    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    return result[0] || null;
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
};