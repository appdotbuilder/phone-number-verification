import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { createUser } from '../handlers/create_user';
import { eq } from 'drizzle-orm';

// Test input with all required fields
const testInput: CreateUserInput = {
  email: 'test@example.com',
  first_name: 'John'
};

describe('createUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a user successfully', async () => {
    const result = await createUser(testInput);

    // Verify returned user object
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('number');
    expect(result.email).toEqual('test@example.com');
    expect(result.first_name).toEqual('John');
    expect(result.phone_number).toBeNull();
    expect(result.phone_verified).toBe(false);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save user to database', async () => {
    const result = await createUser(testInput);

    // Query database to verify user was saved
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].email).toEqual('test@example.com');
    expect(users[0].first_name).toEqual('John');
    expect(users[0].phone_number).toBeNull();
    expect(users[0].phone_verified).toBe(false);
    expect(users[0].created_at).toBeInstanceOf(Date);
    expect(users[0].updated_at).toBeInstanceOf(Date);
  });

  it('should throw error when user with same email already exists', async () => {
    // Create first user
    await createUser(testInput);

    // Attempt to create second user with same email
    await expect(createUser(testInput))
      .rejects.toThrow(/User with email test@example\.com already exists/i);
  });

  it('should create multiple users with different emails', async () => {
    const user1Input: CreateUserInput = {
      email: 'user1@example.com',
      first_name: 'Alice'
    };

    const user2Input: CreateUserInput = {
      email: 'user2@example.com',
      first_name: 'Bob'
    };

    const user1 = await createUser(user1Input);
    const user2 = await createUser(user2Input);

    // Verify both users were created successfully
    expect(user1.id).toBeDefined();
    expect(user2.id).toBeDefined();
    expect(user1.id).not.toEqual(user2.id);
    expect(user1.email).toEqual('user1@example.com');
    expect(user2.email).toEqual('user2@example.com');
    expect(user1.first_name).toEqual('Alice');
    expect(user2.first_name).toEqual('Bob');

    // Verify both users exist in database
    const allUsers = await db.select()
      .from(usersTable)
      .execute();

    expect(allUsers).toHaveLength(2);
  });

  it('should handle special characters in names and emails', async () => {
    const specialInput: CreateUserInput = {
      email: 'test+special@example-domain.co.uk',
      first_name: "O'Connor-Smith"
    };

    const result = await createUser(specialInput);

    expect(result.email).toEqual('test+special@example-domain.co.uk');
    expect(result.first_name).toEqual("O'Connor-Smith");
  });

  it('should set default values correctly', async () => {
    const result = await createUser(testInput);

    // Verify default values are set correctly
    expect(result.phone_number).toBeNull();
    expect(result.phone_verified).toBe(false);
    expect(result.created_at).toBeDefined();
    expect(result.updated_at).toBeDefined();
    
    // Verify timestamps are recent (within last minute)
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    
    expect(result.created_at >= oneMinuteAgo).toBe(true);
    expect(result.created_at <= now).toBe(true);
    expect(result.updated_at >= oneMinuteAgo).toBe(true);
    expect(result.updated_at <= now).toBe(true);
  });
});