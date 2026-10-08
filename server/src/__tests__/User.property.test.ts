/**
 * Property-based tests for server/models/User.js
 *
 * Uses fast-check + @fast-check/vitest for property-based testing.
 * Uses mongodb-memory-server to run a real Mongoose instance in-process.
 *
 * Requirements: 1.5
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { test } from '@fast-check/vitest';
import * as fc from 'fast-check';
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
// Property 2: Email is always stored in lowercase
// Feature: docket, Property 2
// ---------------------------------------------------------------------------

describe('User schema — Property 2: Email is always stored in lowercase', () => {
  // Feature: docket, Property 2
  test.prop(
    [fc.emailAddress()],
    { numRuns: 100 }
  )(
    'stores email in lowercase regardless of input case (Validates: Requirements 1.5)',
    async (email) => {
      const upperEmail = email.toUpperCase();

      const user = new User({
        name: 'Test User',
        email: upperEmail,
        passwordHash: '$2b$12$hashedvalue',
      });

      const saved = await user.save();

      expect(saved.email).toBe(email.toLowerCase());

      // Clean up so the next iteration doesn't hit duplicate key errors
      await user.deleteOne();
    }
  );
});
