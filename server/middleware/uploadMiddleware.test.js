/**
 * Tests for server/middleware/uploadMiddleware.js
 *
 * Validates Requirements 4.2 and 4.3:
 *   - Files exceeding 15 MB return HTTP 413
 *   - Files with unsupported MIME types return HTTP 415 with rejected MIME in message
 *   - Valid files (supported MIME, ≤ 15 MB) are buffered and available as req.file
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { uploadMiddleware } from './uploadMiddleware.js';

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

function buildApp() {
  const app = express();

  app.post('/upload', uploadMiddleware, (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file received' });
    }
    res.status(200).json({
      mimetype: req.file.mimetype,
      size: req.file.size,
      fieldname: req.file.fieldname,
    });
  });

  return app;
}

/** Generate a Buffer of exactly `bytes` length */
function makeBuffer(bytes) {
  return Buffer.alloc(bytes, 'x');
}

describe('uploadMiddleware', () => {
  const app = buildApp();

  // ── Valid uploads ──────────────────────────────────────────────────────────

  describe('valid uploads — supported MIME types within size limit', () => {
    const validCases = [
      { mime: 'application/pdf', ext: 'pdf' },
      { mime: 'image/jpeg', ext: 'jpg' },
      { mime: 'image/png', ext: 'png' },
      { mime: 'image/webp', ext: 'webp' },
    ];

    for (const { mime, ext } of validCases) {
      it(`accepts ${mime} and calls next()`, async () => {
        const buf = makeBuffer(1024); // 1 KB — well within limit

        const res = await request(app)
          .post('/upload')
          .attach('file', buf, { filename: `test.${ext}`, contentType: mime });

        expect(res.status).toBe(200);
        expect(res.body.mimetype).toBe(mime);
      });
    }

    it('makes the file available as req.file with the correct size', async () => {
      const size = 512;
      const buf = makeBuffer(size);

      const res = await request(app)
        .post('/upload')
        .attach('file', buf, { filename: 'test.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(200);
      expect(res.body.size).toBe(size);
    });

    it('accepts a file exactly at the 15 MB boundary', async () => {
      const buf = makeBuffer(MAX_SIZE);

      const res = await request(app)
        .post('/upload')
        .attach('file', buf, { filename: 'big.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(200);
    });
  });

  // ── File too large (Req 4.2) ───────────────────────────────────────────────

  describe('file size limit — Requirement 4.2', () => {
    it('returns HTTP 413 when file exceeds 15 MB', async () => {
      const buf = makeBuffer(MAX_SIZE + 1);

      const res = await request(app)
        .post('/upload')
        .attach('file', buf, { filename: 'toobig.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(413);
    });

    it('returns a JSON error body on 413', async () => {
      const buf = makeBuffer(MAX_SIZE + 1024);

      const res = await request(app)
        .post('/upload')
        .attach('file', buf, { filename: 'toobig.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(413);
      expect(res.body).toHaveProperty('error');
    });

    it('does NOT call the route handler when file is too large', async () => {
      let handlerCalled = false;
      const testApp = express();
      testApp.post('/upload', uploadMiddleware, (_req, res) => {
        handlerCalled = true;
        res.status(200).json({});
      });

      const buf = makeBuffer(MAX_SIZE + 1);
      await request(testApp)
        .post('/upload')
        .attach('file', buf, { filename: 'toobig.pdf', contentType: 'application/pdf' });

      expect(handlerCalled).toBe(false);
    });
  });

  // ── Unsupported MIME type (Req 4.3) ───────────────────────────────────────

  describe('MIME type whitelist — Requirement 4.3', () => {
    const rejectedMimes = [
      'text/plain',
      'text/html',
      'application/json',
      'application/zip',
      'image/gif',
      'image/bmp',
      'video/mp4',
    ];

    for (const mime of rejectedMimes) {
      it(`returns HTTP 415 for ${mime}`, async () => {
        const buf = makeBuffer(1024);

        const res = await request(app)
          .post('/upload')
          .attach('file', buf, { filename: 'file.bin', contentType: mime });

        expect(res.status).toBe(415);
      });
    }

    it('includes the rejected MIME type in the 415 error message', async () => {
      const rejectedMime = 'text/plain';
      const buf = makeBuffer(1024);

      const res = await request(app)
        .post('/upload')
        .attach('file', buf, { filename: 'file.txt', contentType: rejectedMime });

      expect(res.status).toBe(415);
      expect(res.body.error).toContain(rejectedMime);
    });

    it('error message contains "Unsupported file type:" prefix', async () => {
      const buf = makeBuffer(1024);

      const res = await request(app)
        .post('/upload')
        .attach('file', buf, { filename: 'file.gif', contentType: 'image/gif' });

      expect(res.status).toBe(415);
      expect(res.body.error).toMatch(/^Unsupported file type:/);
    });

    it('does NOT call the route handler for unsupported MIME types', async () => {
      let handlerCalled = false;
      const testApp = express();
      testApp.post('/upload', uploadMiddleware, (_req, res) => {
        handlerCalled = true;
        res.status(200).json({});
      });

      const buf = makeBuffer(1024);
      await request(testApp)
        .post('/upload')
        .attach('file', buf, { filename: 'file.txt', contentType: 'text/plain' });

      expect(handlerCalled).toBe(false);
    });
  });

  // ── No file attached ───────────────────────────────────────────────────────

  describe('no file attached', () => {
    it('calls next() and req.file is undefined when no file is sent', async () => {
      const res = await request(app).post('/upload');

      // The route handler returns 400 when req.file is absent — middleware lets it pass
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No file received');
    });
  });
});
