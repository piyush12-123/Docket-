/**
 * Unit tests for server/models/User.js
 *
 * Uses mongodb-memory-server to run a real Mongoose instance in-process
 * without requiring an external MongoDB connection.
 *
 * Requirements: 1.4, 1.5
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// @ts-ignore — JS module without type declarations
import User from '../../models/User.js';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

// ---------------------------------------------------------------------------
// Schema field validation
// ---------------------------------------------------------------------------

describe('User schema — field validation', () => {
  it('saves a valid user successfully', async () => {
    const user = new User({
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: '$2b$12$hashedvalue',
    });
    const saved = await user.save();
    expect(saved._id).toBeDefined();
  });

  it('requires name', async () => {
    const user = new User({ email: 'a@b.com', passwordHash: 'hash' });
    await expect(user.save()).rejects.toThrow(/name/i);
  });

  it('requires email', async () => {
    const user = new User({ name: 'Bob', passwordHash: 'hash' });
    await expect(user.save()).rejects.toThrow(/email/i);
  });

  it('requires passwordHash', async () => {
    const user = new User({ name: 'Bob', email: 'b@b.com' });
    await expect(user.save()).rejects.toThrow(/passwordHash/i);
  });

  it('enforces maxlength 100 on name', async () => {
    const user = new User({
      name: 'A'.repeat(101),
      email: 'c@c.com',
      passwordHash: 'hash',
    });
    await expect(user.save()).rejects.toThrow(/maxlength|is longer than/i);
  });

  it('accepts name exactly 100 characters', async () => {
    const user = new User({
      name: 'A'.repeat(100),
      email: 'd@d.com',
      passwordHash: 'hash',
    });
    const saved = await user.save();
    expect(saved.name).toHaveLength(100);
  });

  it('sets createdAt to a Date by default', async () => {
    const user = new User({
      name: 'Eve',
      email: 'eve@example.com',
      passwordHash: 'hash',
    });
    const saved = await user.save();
    expect(saved.createdAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// Email normalisation — pre('save') hook
// ---------------------------------------------------------------------------

describe('User schema — email normalisation', () => {
  it('converts email to lowercase on save', async () => {
    const user = new User({
      name: 'Charlie',
      email: 'CHARLIE@EXAMPLE.COM',
      passwordHash: 'hash',
    });
    const saved = await user.save();
    expect(saved.email).toBe('charlie@example.com');
  });

  it('preserves already-lowercase email unchanged', async () => {
    const user = new User({
      name: 'Dana',
      email: 'dana@example.com',
      passwordHash: 'hash',
    });
    const saved = await user.save();
    expect(saved.email).toBe('dana@example.com');
  });

  it('normalises mixed-case email', async () => {
    const user = new User({
      name: 'Frank',
      email: 'FrAnK@ExAmPlE.CoM',
      passwordHash: 'hash',
    });
    const saved = await user.save();
    expect(saved.email).toBe('frank@example.com');
  });

  it('stored email equals email.toLowerCase() for any input', async () => {
    const inputs = [
      'TEST@DOMAIN.ORG',
      'Mixed.Case@Sub.Domain.IO',
      'ALL_LOWER@example.net',
      'UPPER@UPPER.UPPER',
    ];

    for (const input of inputs) {
      const user = new User({
        name: 'Tester',
        email: input,
        passwordHash: 'hash',
      });
      const saved = await user.save();
      expect(saved.email).toBe(input.toLowerCase());
      await user.deleteOne();
    }
  });
});

// ---------------------------------------------------------------------------
// Uniqueness constraint
// ---------------------------------------------------------------------------

describe('User schema — unique email constraint', () => {
  it('rejects a duplicate email', async () => {
    await new User({ name: 'First', email: 'dup@example.com', passwordHash: 'h1' }).save();
    const dup = new User({ name: 'Second', email: 'dup@example.com', passwordHash: 'h2' });
    await expect(dup.save()).rejects.toThrow(/duplicate|E11000/i);
  });

  it('treats duplicate emails case-insensitively (both lowercased by hook)', async () => {
    await new User({ name: 'First', email: 'Case@example.com', passwordHash: 'h1' }).save();
    const dup = new User({ name: 'Second', email: 'CASE@example.com', passwordHash: 'h2' });
    await expect(dup.save()).rejects.toThrow(/duplicate|E11000/i);
  });
});
