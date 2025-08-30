import { db } from '../db';
import { usersTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type User } from '../schema';

export const getUser = async (userId: number): Promise<User | null> => {
  try {
    const result = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (result.length === 0) {
      return null;
    }

    return result[0];
  } catch (error) {
    console.error('Failed to get user by ID:', error);
    throw error;
  }
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  try {
    const result = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .execute();

    if (result.length === 0) {
      return null;
    }

    return result[0];
  } catch (error) {
    console.error('Failed to get user by email:', error);
    throw error;
  }
};