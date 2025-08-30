import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type UpdateUserInput, type CreateUserInput } from '../schema';
import { updateUser } from '../handlers/update_user';
import { eq } from 'drizzle-orm';

// Helper function to create a test user
const createTestUser = async (userData: CreateUserInput) => {
  const result = await db.insert(usersTable)
    .values({
      email: userData.email,
      first_name: userData.first_name,
      phone_number: null,
      phone_verified: false
    })
    .returning()
    .execute();
  
  return result[0];
};

// Test input data
const testUserData: CreateUserInput = {
  email: 'test@example.com',
  first_name: 'Test User'
};

describe('updateUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should update user email', async () => {
    const user = await createTestUser(testUserData);
    const originalUpdatedAt = user.updated_at;
    
    // Wait a moment to ensure updated_at changes
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const updateInput: UpdateUserInput = {
      id: user.id,
      email: 'newemail@example.com'
    };

    const result = await updateUser(updateInput);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(user.id);
    expect(result!.email).toEqual('newemail@example.com');
    expect(result!.first_name).toEqual('Test User'); // Should remain unchanged
    expect(result!.phone_number).toBeNull(); // Should remain unchanged
    expect(result!.phone_verified).toEqual(false); // Should remain unchanged
    expect(result!.updated_at).toBeInstanceOf(Date);
    expect(result!.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  it('should update user first name', async () => {
    const user = await createTestUser(testUserData);
    
    const updateInput: UpdateUserInput = {
      id: user.id,
      first_name: 'Updated Name'
    };

    const result = await updateUser(updateInput);

    expect(result).not.toBeNull();
    expect(result!.first_name).toEqual('Updated Name');
    expect(result!.email).toEqual('test@example.com'); // Should remain unchanged
  });

  it('should update phone number and verification status', async () => {
    const user = await createTestUser(testUserData);
    
    const updateInput: UpdateUserInput = {
      id: user.id,
      phone_number: '+1234567890',
      phone_verified: true
    };

    const result = await updateUser(updateInput);

    expect(result).not.toBeNull();
    expect(result!.phone_number).toEqual('+1234567890');
    expect(result!.phone_verified).toEqual(true);
    expect(result!.email).toEqual('test@example.com'); // Should remain unchanged
    expect(result!.first_name).toEqual('Test User'); // Should remain unchanged
  });

  it('should update multiple fields at once', async () => {
    const user = await createTestUser(testUserData);
    
    const updateInput: UpdateUserInput = {
      id: user.id,
      email: 'multi@update.com',
      first_name: 'Multi Update',
      phone_number: '+9876543210',
      phone_verified: true
    };

    const result = await updateUser(updateInput);

    expect(result).not.toBeNull();
    expect(result!.email).toEqual('multi@update.com');
    expect(result!.first_name).toEqual('Multi Update');
    expect(result!.phone_number).toEqual('+9876543210');
    expect(result!.phone_verified).toEqual(true);
  });

  it('should set phone_number to null when explicitly provided', async () => {
    // Create user with phone number
    const userWithPhone = await db.insert(usersTable)
      .values({
        email: 'phone@example.com',
        first_name: 'Phone User',
        phone_number: '+1234567890',
        phone_verified: true
      })
      .returning()
      .execute();
    
    const updateInput: UpdateUserInput = {
      id: userWithPhone[0].id,
      phone_number: null,
      phone_verified: false
    };

    const result = await updateUser(updateInput);

    expect(result).not.toBeNull();
    expect(result!.phone_number).toBeNull();
    expect(result!.phone_verified).toEqual(false);
  });

  it('should return null for non-existent user', async () => {
    const updateInput: UpdateUserInput = {
      id: 99999, // Non-existent ID
      email: 'notfound@example.com'
    };

    const result = await updateUser(updateInput);

    expect(result).toBeNull();
  });

  it('should save changes to database', async () => {
    const user = await createTestUser(testUserData);
    
    const updateInput: UpdateUserInput = {
      id: user.id,
      email: 'database@test.com',
      first_name: 'Database Test'
    };

    await updateUser(updateInput);

    // Verify changes are persisted in database
    const updatedUserFromDB = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .execute();

    expect(updatedUserFromDB).toHaveLength(1);
    expect(updatedUserFromDB[0].email).toEqual('database@test.com');
    expect(updatedUserFromDB[0].first_name).toEqual('Database Test');
    expect(updatedUserFromDB[0].updated_at).toBeInstanceOf(Date);
  });

  it('should always update the updated_at timestamp', async () => {
    const user = await createTestUser(testUserData);
    const originalUpdatedAt = user.updated_at;
    
    // Wait to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const updateInput: UpdateUserInput = {
      id: user.id,
      // Only updating email, but updated_at should still change
      email: 'timestamp@test.com'
    };

    const result = await updateUser(updateInput);

    expect(result).not.toBeNull();
    expect(result!.updated_at).toBeInstanceOf(Date);
    expect(result!.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  it('should handle partial updates correctly', async () => {
    const user = await createTestUser(testUserData);
    
    // Update only one field
    const updateInput: UpdateUserInput = {
      id: user.id,
      phone_verified: true
    };

    const result = await updateUser(updateInput);

    expect(result).not.toBeNull();
    expect(result!.phone_verified).toEqual(true);
    // All other fields should remain unchanged
    expect(result!.email).toEqual('test@example.com');
    expect(result!.first_name).toEqual('Test User');
    expect(result!.phone_number).toBeNull();
  });
});