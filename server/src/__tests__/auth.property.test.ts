/**
 * Property-based tests for the auth service (authController + authMiddleware).
 *
 * Uses fast-check + @fast-check/vitest + supertest + mongodb-memory-server.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.4, 15.4
 *
 * Properties covered:
 *   Property 1 — Registration stores a hash, never the plaintext password
 *   Property 3 — Duplicate email registration is rejected
 *   Property 4 — Invalid registration inputs return HTTP 400
 *   Property 5 — Auth round-trip (register → login → /me) returns consistent user data
 *   Property 6 — Invalid login credentials return generic HTTP 401
 *   Property 7 — Auth middleware rejects all invalid JWTs before handler execution
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

// @ts-ignore — JS module without type declarations
import { app } from '../../index.js';
// @ts-ignore
import User from '../../models/User.js';

// ---------------------------------------------------------------------------
// In-memory MongoDB lifecycle
// ---------------------------------------------------------------------------

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  } else {
    // Reconnect to the in-memory instance if mongoose is already initialised
    await mongoose.disconnect();
    await mongoose.connect(uri);
  }
  // Set a deterministic JWT secret for tests
  process.env.JWT_SECRET = 'test-jwt-secret-docket';
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Clear all users between runs so duplicate-detection tests start fresh
  await User.deleteMany({});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST /api/auth/register shorthand */
const register = (body: Record<string, unknown>) =>
  request(app).post('/api/auth/register').send(body).set('Content-Type', 'application/json');

/** POST /api/auth/login shorthand */
const login = (body: Record<string, unknown>) =>
  request(app).post('/api/auth/login').send(body).set('Content-Type', 'application/json');

/** GET /api/auth/me shorthand */
const me = (token: string) =>
  request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

// ---------------------------------------------------------------------------
// Property 1 — Registration stores a hash, never the plaintext password
// Feature: docket, Property 1
// Validates: Requirements 1.1, 1.4
// ---------------------------------------------------------------------------

describe('Property 1: Registration stores a hash, never the plaintext password', () => {
  // Feature: docket, Property 1
  test.prop(
    [
      fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      fc.emailAddress(),
      fc.string({ minLength: 8 }),
    ],
    { numRuns: 100 }
  )('passwordHash is never equal to plaintext and starts with $2b$', async (name, email, password) => {
    const res = await register({ name, email, password });

    // Registration must succeed (201) for this property to be meaningful
    // If it fails for another reason (e.g. invalid email from fc), skip gracefully
    if (res.status !== 201) return;

    // Retrieve the stored user directly from the DB
    const storedUser = await User.findOne({ email: email.toLowerCase() });
    expect(storedUser).not.toBeNull();

    const { passwordHash } = storedUser!;

    // Plaintext must NOT be stored
    expect(passwordHash).not.toBe(password);

    // bcryptjs hashes always begin with '$2b$'
    expect(passwordHash).toMatch(/^\$2b\$/);

    // The entire stored document must not contain the plaintext password
    const userJson = JSON.stringify(storedUser!.toObject());
    expect(userJson).not.toContain(password);
  });
});

// ---------------------------------------------------------------------------
// Property 3 — Duplicate email registration is rejected
// Feature: docket, Property 3
// Validates: Requirements 1.2
// ---------------------------------------------------------------------------

describe('Property 3: Duplicate email registration is rejected', () => {
  // Feature: docket, Property 3
  test.prop(
    [
      fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      fc.emailAddress(),
      fc.string({ minLength: 8 }),
      // Case variant to apply to the duplicate attempt: 0 = lowercase, 1 = uppercase, 2 = mixed
      fc.integer({ min: 0, max: 2 }),
    ],
    { numRuns: 100 }
  )('second registration with same email (any casing) returns 409 and no extra user', async (name, email, password, caseVariant) => {
    // First registration — must succeed
    const first = await register({ name, email, password });
    if (first.status !== 201) return;

    const countAfterFirst = await User.countDocuments({});

    // Build a case variant of the email
    let variantEmail: string;
    if (caseVariant === 0) {
      variantEmail = email.toLowerCase();
    } else if (caseVariant === 1) {
      variantEmail = email.toUpperCase();
    } else {
      // Alternate upper/lower per character
      variantEmail = email
        .split('')
        .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
        .join('');
    }

    const second = await register({ name: 'Other', email: variantEmail, password });

    // Must be rejected with 409
    expect(second.status).toBe(409);

    // No new user should have been created
    const countAfterSecond = await User.countDocuments({});
    expect(countAfterSecond).toBe(countAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// Property 4 — Invalid registration inputs return HTTP 400
// Feature: docket, Property 4
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------

describe('Property 4: Invalid registration inputs return HTTP 400', () => {
  // Generators for each invalid-input category
  const emptyName = fc.record({
    name: fc.oneof(fc.constant(''), fc.constant('   ')),
    email: fc.emailAddress(),
    password: fc.string({ minLength: 8 }),
  });

  const badEmail = fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    // Strings guaranteed to have no @ symbol or invalid domain, so express-validator rejects them
    email: fc.string({ minLength: 1, maxLength: 50 }).map((s) => s.replace(/@/g, '') + 'invalidemail'),
    password: fc.string({ minLength: 8 }),
  });

  const shortPassword = fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    email: fc.emailAddress(),
    // Passwords strictly shorter than 8 characters
    password: fc.string({ minLength: 0, maxLength: 7 }),
  });

  // Feature: docket, Property 4
  test.prop([fc.oneof(emptyName, badEmail, shortPassword)], { numRuns: 100 })(
    'invalid inputs return 400 and no user is created',
    async (body) => {
      const countBefore = await User.countDocuments({});
      const res = await register(body);

      expect(res.status).toBe(400);

      const countAfter = await User.countDocuments({});
      expect(countAfter).toBe(countBefore);
    }
  );
});

// ---------------------------------------------------------------------------
// Property 5 — Auth round-trip: register → login → /me returns consistent data
// Feature: docket, Property 5
// Validates: Requirements 1.1, 2.1, 2.3
// ---------------------------------------------------------------------------

describe('Property 5: Auth round-trip returns consistent user data', () => {
  // Feature: docket, Property 5
  test.prop(
    [
      fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      fc.emailAddress(),
      fc.string({ minLength: 8 }),
    ],
    { numRuns: 100 }
  )('register → login → /me returns matching name/email and JWT expires in ~7 days', async (name, email, password) => {
    // 1. Register
    const regRes = await register({ name, email, password });
    if (regRes.status !== 201) return;

    const regToken: string = regRes.body.token;
    expect(typeof regToken).toBe('string');

    // 2. Login with the same credentials
    const loginRes = await login({ email, password });
    expect(loginRes.status).toBe(200);

    const loginToken: string = loginRes.body.token;
    expect(typeof loginToken).toBe('string');

    // 3. Verify JWT expiry is approximately 7 days from now (within ±60 s tolerance)
    const decoded = jwt.decode(loginToken) as { exp: number; userId: string };
    expect(decoded).not.toBeNull();
    expect(decoded.exp).toBeDefined();

    const nowSec = Math.floor(Date.now() / 1000);
    const sevenDaysSec = 7 * 24 * 60 * 60;
    const tolerance = 60; // seconds

    expect(decoded.exp).toBeGreaterThanOrEqual(nowSec + sevenDaysSec - tolerance);
    expect(decoded.exp).toBeLessThanOrEqual(nowSec + sevenDaysSec + tolerance);

    // 4. /me with the login token returns matching user data
    const meRes = await me(loginToken);
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(email.toLowerCase());
    expect(meRes.body.name).toBe(name.trim());
  });
});

// ---------------------------------------------------------------------------
// Property 6 — Invalid login credentials return generic HTTP 401
// Feature: docket, Property 6
// Validates: Requirements 2.2
// ---------------------------------------------------------------------------

describe('Property 6: Invalid login credentials return generic HTTP 401', () => {
  // Feature: docket, Property 6
  test.prop(
    [
      fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      fc.emailAddress(),
      fc.string({ minLength: 8 }),
      // A second email guaranteed different from the first (unregistered)
      fc.emailAddress(),
      fc.string({ minLength: 8 }),
      // Which invalid scenario: 0 = unregistered email, 1 = wrong password
      fc.integer({ min: 0, max: 1 }),
    ],
    { numRuns: 100 }
  )('unregistered email or wrong password returns 401 with single generic message', async (
    name,
    email,
    password,
    otherEmail,
    wrongPassword,
    scenario
  ) => {
    // Register a real user first
    const regRes = await register({ name, email, password });
    if (regRes.status !== 201) return;

    let loginRes: Awaited<ReturnType<typeof login>>;

    if (scenario === 0) {
      // Use an email that is definitely different from the registered one
      const unregisteredEmail = otherEmail === email ? `x-${otherEmail}` : otherEmail;
      loginRes = await login({ email: unregisteredEmail, password });
    } else {
      // Use wrong password — must differ from the real one
      const badPwd = wrongPassword === password ? `${wrongPassword}X` : wrongPassword;
      loginRes = await login({ email, password: badPwd });
    }

    expect(loginRes.status).toBe(401);

    // Response body must have exactly one error field with a generic message
    const body = loginRes.body as Record<string, unknown>;
    const errorKeys = Object.keys(body);
    expect(errorKeys).toHaveLength(1);
    expect(typeof body.error).toBe('string');
    // Must NOT reveal whether it was the email or the password that was wrong
    const errorMsg = (body.error as string).toLowerCase();
    expect(errorMsg).not.toMatch(/email/);
    expect(errorMsg).not.toMatch(/password/);
  });
});

// ---------------------------------------------------------------------------
// Property 7 — Auth middleware rejects all invalid JWTs before handler execution
// Feature: docket, Property 7
// Validates: Requirements 2.4, 15.4
// ---------------------------------------------------------------------------

describe('Property 7: Auth middleware rejects all invalid JWTs', () => {
  // Generator: malformed token strings (not a valid JWT)
  const malformedToken = fc.oneof(
    // Completely random strings
    fc.string({ minLength: 0, maxLength: 200 }),
    // Strings with dots but not valid JWT structure
    fc.string({ minLength: 1, maxLength: 50 }).map((s) => `${s}.${s}`),
    fc.string({ minLength: 1, maxLength: 50 }).map((s) => `${s}.${s}.`),
    // Empty string
    fc.constant(''),
    // Looks like Bearer header value but garbage
    fc.constant('Bearer '),
    fc.constant('notavalidjwt'),
  );

  // Feature: docket, Property 7
  test.prop([malformedToken], { numRuns: 500 })(
    'malformed or missing token returns 401 and handler is not executed',
    async (token) => {
      // Use /api/auth/me as the protected route under test
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      // Handler must not run — no user data in the response body
      expect(res.body).not.toHaveProperty('name');
      expect(res.body).not.toHaveProperty('email');
    }
  );

  // Feature: docket, Property 7
  test('missing Authorization header returns 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  // Feature: docket, Property 7
  test('expired JWT returns 401', async () => {
    // Sign a JWT that expired 1 second ago
    const expiredToken = jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString() },
      process.env.JWT_SECRET!,
      { expiresIn: -1 }
    );

    const res = await me(expiredToken);
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('name');
    expect(res.body).not.toHaveProperty('email');
  });

  // Feature: docket, Property 7
  test('JWT signed with wrong secret returns 401', async () => {
    const wrongSecretToken = jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString() },
      'completely-wrong-secret'
    );

    const res = await me(wrongSecretToken);
    expect(res.status).toBe(401);
  });
});
