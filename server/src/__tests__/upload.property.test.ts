/**
 * Property-based tests for document upload validation.
 *
 * Uses fast-check + @fast-check/vitest + supertest + mongodb-memory-server.
 *
 * Properties covered:
 *   Property 10 — Unsupported MIME types are rejected with HTTP 415
 *   Property 11 — Valid upload creates a Document in Processing State scoped to the authenticated user
 *
 * Validates: Requirements 4.3, 4.4
 */

import {
  describe,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from 'vitest';
import { fc, test } from '@fast-check/vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

// @ts-ignore — JS module without type declarations
import { app } from '../../index.js';
// @ts-ignore
import Document from '../../models/Document.js';

// ---------------------------------------------------------------------------
// Mock cloudinaryService so no real network calls are made
// ---------------------------------------------------------------------------

vi.mock('../../services/cloudinaryService.js', () => ({
  uploadStream: vi.fn().mockResolvedValue({
    fileUrl: 'https://example.com/file',
    publicId: 'test-id',
  }),
  deleteFile: vi.fn().mockResolvedValue({}),
}));

// Mock ingestionPipeline so it never actually runs during tests
vi.mock('../../services/ingestionPipeline.js', () => ({
  run: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// In-memory MongoDB lifecycle
// ---------------------------------------------------------------------------

let mongod: MongoMemoryServer;

// Tokens shared across property runs within each describe block — registered once.
let sharedToken10: string; // for Property 10 (MIME rejection tests)
let sharedToken11: string; // for Property 11 (valid upload tests)
let sharedUserId11: string; // userId for Property 11 owner checks

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  } else {
    await mongoose.disconnect();
    await mongoose.connect(uri);
  }
  process.env.JWT_SECRET = 'test-jwt-secret-docket';

  // Register two dedicated test users and cache their tokens.
  // Registering once amortises the bcrypt cost across all 100/50 runs.
  const reg10 = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Upload Test 10', email: 'upload-prop10@example.com', password: 'password123' })
    .set('Content-Type', 'application/json');

  if (reg10.status !== 201) {
    throw new Error(`Setup registration (prop10) failed: ${JSON.stringify(reg10.body)}`);
  }
  sharedToken10 = reg10.body.token as string;

  const reg11 = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Upload Test 11', email: 'upload-prop11@example.com', password: 'password123' })
    .set('Content-Type', 'application/json');

  if (reg11.status !== 201) {
    throw new Error(`Setup registration (prop11) failed: ${JSON.stringify(reg11.body)}`);
  }
  sharedToken11 = reg11.body.token as string;
  const decoded = jwt.decode(sharedToken11) as { userId: string };
  sharedUserId11 = decoded.userId;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Only clean up Document records between runs; leave User records intact
  // so the shared tokens remain valid throughout the test suite.
  await Document.deleteMany({});
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * POST /api/documents with a small fake file buffer.
 * The buffer content is irrelevant — MIME validation is driven by the
 * Content-Type header on the multipart part, not by file sniffing.
 */
function uploadFile(
  token: string,
  mimeType: string,
  filename: string = 'test.bin'
) {
  const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);

  return request(app)
    .post('/api/documents')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buf, { filename, contentType: mimeType });
}

// ---------------------------------------------------------------------------
// Property 10 — Unsupported MIME types are rejected with HTTP 415
// Feature: docket, Property 10
// Validates: Requirements 4.3
// ---------------------------------------------------------------------------

describe('Property 10: Unsupported MIME types are rejected with HTTP 415', () => {
  // Feature: docket, Property 10

  // Generate MIME type strings that:
  //   1. Are syntactically valid (RFC 2045 token chars, with exactly one '/').
  //   2. Are NOT one of the four allowed types.
  // Valid token chars per RFC 2045, minus '{' and '}' which the content-type
  // package rejects: [a-zA-Z0-9!#$%&'*+\-.^_`|~]
  const unsupportedMimeType = fc
    .stringMatching(
      /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]{1,20}\/[a-zA-Z0-9!#$%&'*+\-.^_`|~]{1,20}$/
    )
    .filter(
      (s) =>
        !ALLOWED_MIME_TYPES.includes(
          s.toLowerCase() as (typeof ALLOWED_MIME_TYPES)[number]
        )
    );

  test.prop([unsupportedMimeType], { numRuns: 100 })(
    'unsupported MIME type returns 415, error contains the MIME type, no Document created',
    async (mimeType) => {
      const countBefore = await Document.countDocuments({});

      const res = await uploadFile(sharedToken10, mimeType, 'test.bin');

      // Must be rejected with 415
      expect(res.status).toBe(415);

      // Error message must reference the rejected MIME type.
      // The content-type package lowercases MIME types, so compare case-insensitively.
      const body = res.body as { error?: string };
      expect(typeof body.error).toBe('string');
      expect(body.error!.toLowerCase()).toContain(mimeType.toLowerCase());

      // No Document record should have been created
      const countAfter = await Document.countDocuments({});
      expect(countAfter).toBe(countBefore);
    },
    60_000 // generous per-test timeout for 100 runs
  );
});

// ---------------------------------------------------------------------------
// Property 11 — Valid upload creates a Document in Processing State scoped to
//               the authenticated user
// Feature: docket, Property 11
// Validates: Requirements 4.4
// ---------------------------------------------------------------------------

describe('Property 11: Valid upload creates a Document in Processing State', () => {
  // Feature: docket, Property 11
  test.prop(
    [fc.constantFrom(...ALLOWED_MIME_TYPES)],
    { numRuns: 50 }
  )(
    'valid MIME type returns 202 with status processing and a documentId scoped to the authenticated user',
    async (mimeType) => {
      // Derive an appropriate filename extension
      const ext =
        mimeType === 'application/pdf'
          ? 'pdf'
          : mimeType === 'image/jpeg'
          ? 'jpg'
          : mimeType === 'image/png'
          ? 'png'
          : 'webp';

      const res = await uploadFile(sharedToken11, mimeType, `test.${ext}`);

      // Must respond with 202
      expect(res.status).toBe(202);

      const body = res.body as { documentId?: unknown; status?: unknown };

      // documentId must be present and be a string
      expect(body.documentId).toBeDefined();
      expect(typeof body.documentId).toBe('string');

      // status must be 'processing'
      expect(body.status).toBe('processing');

      // Verify the Document was persisted in the DB
      const doc = await Document.findById(body.documentId as string);
      expect(doc).not.toBeNull();
      expect(doc!.status).toBe('processing');

      // Document must be scoped to the authenticated user (Req 4.4, 15.1)
      expect(doc!.userId.toString()).toBe(sharedUserId11);
    },
    60_000 // generous per-test timeout for 50 runs
  );
});
