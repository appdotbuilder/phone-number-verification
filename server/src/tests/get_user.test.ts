import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { getUser, getUserByEmail } from '../handlers/get_user';

// Test user input data
const testUser1: CreateUserInput = {
  email: 'john.doe@example.com',
  first_name: 'John'
};

const testUser2: CreateUserInput = {
  email: 'jane.smith@example.com',
  first_name: 'Jane'
};

describe('getUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return user when found by ID', async () => {
    // Create test user
    const insertResult = await db.insert(usersTable)
      .values({
        email: testUser1.email,
        first_name: testUser1.first_name
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user by ID
    const result = await getUser(createdUser.id);

    // Verify user data
    expect(result).not.toBeNull();
    expect(result!.id).toEqual(createdUser.id);
    expect(result!.email).toEqual('john.doe@example.com');
    expect(result!.first_name).toEqual('John');
    expect(result!.phone_number).toBeNull();
    expect(result!.phone_verified).toEqual(false);
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should return null when user not found by ID', async () => {
    // Try to get non-existent user
    const result = await getUser(99999);

    expect(result).toBeNull();
  });

  it('should return user with phone number when set', async () => {
    // Create test user with phone number
    const insertResult = await db.insert(usersTable)
      .values({
        email: testUser1.email,
        first_name: testUser1.first_name,
        phone_number: '+1234567890',
        phone_verified: true
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user by ID
    const result = await getUser(createdUser.id);

    // Verify user data including phone information
    expect(result).not.toBeNull();
    expect(result!.id).toEqual(createdUser.id);
    expect(result!.phone_number).toEqual('+1234567890');
    expect(result!.phone_verified).toEqual(true);
  });
});

describe('getUserByEmail', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return user when found by email', async () => {
    // Create test user
    const insertResult = await db.insert(usersTable)
      .values({
        email: testUser2.email,
        first_name: testUser2.first_name
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user by email
    const result = await getUserByEmail('jane.smith@example.com');

    // Verify user data
    expect(result).not.toBeNull();
    expect(result!.id).toEqual(createdUser.id);
    expect(result!.email).toEqual('jane.smith@example.com');
    expect(result!.first_name).toEqual('Jane');
    expect(result!.phone_number).toBeNull();
    expect(result!.phone_verified).toEqual(false);
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should return null when user not found by email', async () => {
    // Try to get non-existent user
    const result = await getUserByEmail('nonexistent@example.com');

    expect(result).toBeNull();
  });

  it('should be case sensitive for email lookup', async () => {
    // Create test user
    await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        first_name: 'Test'
      })
      .execute();

    // Test exact match works
    const exactMatch = await getUserByEmail('test@example.com');
    expect(exactMatch).not.toBeNull();
    expect(exactMatch!.email).toEqual('test@example.com');

    // Test case sensitivity - should not find user
    const caseMatch = await getUserByEmail('TEST@EXAMPLE.COM');
    expect(caseMatch).toBeNull();
  });

  it('should handle unique constraint by returning single user', async () => {
    // Create test user
    const insertResult = await db.insert(usersTable)
      .values({
        email: 'unique@example.com',
        first_name: 'Unique'
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user by email - should return single result
    const result = await getUserByEmail('unique@example.com');

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(createdUser.id);
    expect(result!.email).toEqual('unique@example.com');
  });

  it('should work with both handlers together', async () => {
    // Create test user
    const insertResult = await db.insert(usersTable)
      .values({
        email: 'both@example.com',
        first_name: 'Both',
        phone_number: '+9876543210',
        phone_verified: true
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user by email first
    const userByEmail = await getUserByEmail('both@example.com');
    expect(userByEmail).not.toBeNull();

    // Then get the same user by ID
    const userById = await getUser(userByEmail!.id);
    expect(userById).not.toBeNull();

    // Both results should be identical
    expect(userByEmail!.id).toEqual(userById!.id);
    expect(userByEmail!.email).toEqual(userById!.email);
    expect(userByEmail!.first_name).toEqual(userById!.first_name);
    expect(userByEmail!.phone_number).toEqual(userById!.phone_number);
    expect(userByEmail!.phone_verified).toEqual(userById!.phone_verified);
    expect(userByEmail!.created_at.getTime()).toEqual(userById!.created_at.getTime());
    expect(userByEmail!.updated_at.getTime()).toEqual(userById!.updated_at.getTime());
  });
});