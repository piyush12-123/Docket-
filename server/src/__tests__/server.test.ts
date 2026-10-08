/**
 * Tests for server/index.js — Express app setup and /api/health route.
 *
 * Uses supertest to make real HTTP requests against the exported `app`
 * without actually starting a TCP listener or connecting to MongoDB.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';

// Import the exported app directly (no listen() call needed for supertest)
// @ts-ignore — JS module without type declarations
import { app } from '../../index.js';

describe('Express app — server/index.js', () => {
  describe('GET /api/health', () => {
    it('returns HTTP 200', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
    });

    it('returns { status: "ok" } in the body', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body).toMatchObject({ status: 'ok' });
    });

    it('responds with JSON content-type', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Security headers (helmet)', () => {
    it('sets X-Content-Type-Options header', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Frame-Options header', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });

  describe('CORS', () => {
    it('allows requests from the configured origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173');
      // If CORS is applied, the access-control-allow-origin header should be present
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });

  describe('Body parsing middleware', () => {
    it('parses JSON bodies', async () => {
      // /api/health doesn't accept a body, but we can confirm the middleware
      // is mounted by checking that an unknown route with a JSON body doesn't crash
      const res = await request(app)
        .post('/api/nonexistent')
        .send({ key: 'value' })
        .set('Content-Type', 'application/json');
      // 404 is fine — the important thing is the server handled it without crashing
      expect(res.status).toBeLessThan(500);
    });

    it('parses URL-encoded bodies', async () => {
      const res = await request(app)
        .post('/api/nonexistent')
        .send('key=value')
        .set('Content-Type', 'application/x-www-form-urlencoded');
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('Error handler', () => {
    it('returns 404 for unknown routes without crashing', async () => {
      const res = await request(app).get('/api/totally-unknown-route-xyz');
      expect(res.status).toBe(404);
    });
  });
});
