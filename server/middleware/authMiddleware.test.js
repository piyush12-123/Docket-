/**
 * Tests for server/middleware/authMiddleware.js
 *
 * Validates Requirements 2.4 and 15.4:
 *   - Protected routes return HTTP 401 on missing/malformed/expired JWT
 *   - No route handler logic executes on auth failure
 *   - req.userId is attached on success
 *   - 401 is returned without revealing whether the resource exists
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import express from 'express';
import request from 'supertest';
import { authMiddleware } from './authMiddleware.js';

const TEST_SECRET = 'test-secret-key';

// Build a minimal Express app wired with the middleware
function buildApp() {
  const app = express();
  app.use(express.json());

  // A protected route that records whether the handler was called
  const handlerCalled = { value: false };
  app.get('/protected', authMiddleware, (req, res) => {
    handlerCalled.value = true;
    res.status(200).json({ userId: req.userId });
  });

  return { app, handlerCalled };
}

function signToken(payload, options = {}) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: '7d', ...options });
}

describe('authMiddleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  // ── Success path ────────────────────────────────────────────────────────────

  describe('valid JWT', () => {
    it('returns HTTP 200 and calls next()', async () => {
      const { app } = buildApp();
      const token = signToken({ userId: 'user123' });

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('attaches req.userId from the JWT payload', async () => {
      const { app } = buildApp();
      const token = signToken({ userId: 'abc-user-id' });

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.userId).toBe('abc-user-id');
    });

    it('executes the route handler on success', async () => {
      const { app, handlerCalled } = buildApp();
      const token = signToken({ userId: 'user123' });

      await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(handlerCalled.value).toBe(true);
    });
  });

  // ── Missing / malformed Authorization header ─────────────────────────────

  describe('missing or malformed Authorization header', () => {
    it('returns HTTP 401 when Authorization header is absent', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/protected');
      expect(res.status).toBe(401);
    });

    it('returns JSON error body when header is absent', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/protected');
      expect(res.body).toHaveProperty('error');
    });

    it('returns HTTP 401 when Authorization header lacks "Bearer " prefix', async () => {
      const { app } = buildApp();
      const token = signToken({ userId: 'user123' });

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Token ${token}`);

      expect(res.status).toBe(401);
    });

    it('returns HTTP 401 when Authorization value is "Bearer " with no token', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer ');

      expect(res.status).toBe(401);
    });

    it('does NOT call the route handler when header is absent', async () => {
      const { app, handlerCalled } = buildApp();
      await request(app).get('/protected');
      expect(handlerCalled.value).toBe(false);
    });
  });

  // ── Malformed token ──────────────────────────────────────────────────────

  describe('malformed token', () => {
    it('returns HTTP 401 for a random string', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer not.a.jwt');

      expect(res.status).toBe(401);
    });

    it('returns HTTP 401 for a token signed with the wrong secret', async () => {
      const { app } = buildApp();
      const token = jwt.sign({ userId: 'user123' }, 'wrong-secret', { expiresIn: '7d' });

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    it('does NOT call the route handler for malformed tokens', async () => {
      const { app, handlerCalled } = buildApp();
      await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer garbage');
      expect(handlerCalled.value).toBe(false);
    });
  });

  // ── Expired token ────────────────────────────────────────────────────────

  describe('expired token', () => {
    it('returns HTTP 401 for an expired token', async () => {
      const { app } = buildApp();
      // expiresIn: 0 creates a token that expires immediately
      const token = jwt.sign({ userId: 'user123' }, TEST_SECRET, { expiresIn: 0 });

      // Small delay to ensure token is past its expiry
      await new Promise((r) => setTimeout(r, 10));

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    it('does NOT call the route handler for expired tokens', async () => {
      const { app, handlerCalled } = buildApp();
      const token = jwt.sign({ userId: 'user123' }, TEST_SECRET, { expiresIn: 0 });

      await new Promise((r) => setTimeout(r, 10));

      await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(handlerCalled.value).toBe(false);
    });
  });

  // ── Generic 401 response (Req 15.4 — no resource-existence leakage) ──────

  describe('401 response body', () => {
    it('returns a generic error message — does not reveal resource existence', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/protected');

      // Should be a plain "Unauthorized" — no mention of specific resource
      expect(res.body.error).toBe('Unauthorized');
    });

    it('always returns the same 401 body regardless of the failure reason', async () => {
      const { app } = buildApp();

      const cases = [
        request(app).get('/protected'), // no header
        request(app).get('/protected').set('Authorization', 'Bearer garbage'), // malformed
        request(app).get('/protected').set('Authorization', 'Token valid'), // wrong scheme
      ];

      const responses = await Promise.all(cases);
      for (const res of responses) {
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Unauthorized');
      }
    });
  });
});
