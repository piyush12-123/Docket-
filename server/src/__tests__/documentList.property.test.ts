/**
 * Property-based tests for the document list endpoint (GET /api/documents).
 *
 * Uses fast-check + @fast-check/vitest + supertest + mongodb-memory-server.
 * Documents are inserted directly via the Mongoose model to keep tests fast.
 * cloudinaryService and ingestionPipeline are mocked so no external calls are made.
 *
 * // Feature: docket, Property 16
 * **Validates: Requirements 7.1, 15.2**
 *
 * Property 16: Document list is scoped to the authenticated user and sorted by creation date descending
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Mock cloudinaryService and ingestionPipeline before importing app
// so the app module does not attempt real external calls during import.
// ---------------------------------------------------------------------------

vi.mock('../../services/cloudinaryService.js', () => ({
  uploadStream: vi.fn().mockResolvedValue({
    fileUrl: 'https://res.cloudinary.com/test/image/upload/v1/test.pdf',
    publicId: 'test-public-id',
  }),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/ingestionPipeline.js', () => ({
  run: vi.fn().mockResolvedValue(undefined),
}));

// @ts-ignore — JS module without type declarations
import { app } from '../../index.js';
// @ts-ignore
import Document from '../../models/Document.js';
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
    await mongoose.disconnect();
    await mongoose.connect(uri);
  }
  process.env.JWT_SECRET = 'test-jwt-secret-docket';
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Document.deleteMany({});
  await User.deleteMany({});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mint a valid JWT for the given userId */
function mintToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '7d' });
}

/** Create a minimal User document in the DB and return its _id as a string */
async function createUser(suffix: string): Promise<string> {
  const user = await new User({
    name: `Test User ${suffix}`,
    email: `testuser-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    passwordHash: '$2b$12$fakehashvalue',
  }).save();
  return (user._id as mongoose.Types.ObjectId).toString();
}

/**
 * Insert `count` Document records for the given userId, each with a
 * createdAt spaced 1 second apart so sort order is deterministic.
 * Returns the inserted documents sorted by createdAt descending.
 */
async function insertDocumentsForUser(
  userId: string,
  count: number,
  baseTime: Date = new Date()
): Promise<mongoose.Document[]> {
  const docs: mongoose.Document[] = [];
  for (let i = 0; i < count; i++) {
    const createdAt = new Date(baseTime.getTime() + i * 1000);
    const doc = await new Document({
      userId,
      title: `Document ${i}`,
      originalFilename: `doc-${i}.pdf`,
      fileUrl: `https://example.com/doc-${i}.pdf`,
      fileType: 'pdf',
      status: 'ready',
      createdAt,
      updatedAt: createdAt,
    }).save();
    docs.push(doc);
  }
  // Return sorted newest-first (mirrors what the API should return)
  return docs.sort(
    (a, b) =>
      (b as any).createdAt.getTime() - (a as any).createdAt.getTime()
  );
}

// ---------------------------------------------------------------------------
// Property 16: Document list is scoped to the authenticated user and sorted
//              by creation date descending, max 50 per page.
// // Feature: docket, Property 16
// Validates: Requirements 7.1, 15.2
// ---------------------------------------------------------------------------

describe('Property 16: Document list is scoped to the authenticated user and sorted by creation date descending', () => {
  // Feature: docket, Property 16
  test.prop(
    [
      // Number of documents to create for user A (0–60 to test pagination cap)
      fc.integer({ min: 0, max: 60 }),
      // Number of documents to create for user B (1–20)
      fc.integer({ min: 1, max: 20 }),
    ],
    { numRuns: 100 }
  )(
    'response contains only user A documents, sorted createdAt desc, at most 50 per page',
    async (userADocCount, userBDocCount) => {
      // Create two distinct users
      const userAId = await createUser('A');
      const userBId = await createUser('B');

      // Insert documents for both users
      const baseTime = new Date('2024-01-01T00:00:00.000Z');
      const userADocs = await insertDocumentsForUser(userAId, userADocCount, baseTime);
      await insertDocumentsForUser(userBId, userBDocCount, baseTime);

      // GET /api/documents as user A
      const token = mintToken(userAId);
      const res = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);

      const { documents, total, page, limit } = res.body as {
        documents: Array<{ _id: string; userId: string; createdAt: string }>;
        total: number;
        page: number;
        limit: number;
      };

      // --- Assertion 1: response contains ONLY user A's documents ---
      for (const doc of documents) {
        expect(doc.userId.toString()).toBe(userAId);
      }

      // --- Assertion 2: no user B documents appear in the response ---
      const returnedIds = new Set(documents.map((d) => d._id.toString()));
      // Verify none of user B's docs leaked in
      const userBDocIds = await Document.find({ userId: userBId }).select('_id');
      for (const bDoc of userBDocIds) {
        expect(returnedIds.has((bDoc._id as mongoose.Types.ObjectId).toString())).toBe(false);
      }

      // --- Assertion 3: at most 50 documents per page ---
      expect(limit).toBe(50);
      expect(documents.length).toBeLessThanOrEqual(50);

      // --- Assertion 4: total reflects user A's total count, not combined ---
      expect(total).toBe(userADocCount);

      // --- Assertion 5: documents are sorted by createdAt descending ---
      for (let i = 0; i < documents.length - 1; i++) {
        const currentCreatedAt = new Date(documents[i].createdAt).getTime();
        const nextCreatedAt = new Date(documents[i + 1].createdAt).getTime();
        expect(currentCreatedAt).toBeGreaterThanOrEqual(nextCreatedAt);
      }

      // --- Assertion 6: returned docs match the expected first page of user A's docs ---
      const expectedFirstPage = userADocs.slice(0, 50);
      expect(documents.length).toBe(expectedFirstPage.length);

      for (let i = 0; i < expectedFirstPage.length; i++) {
        expect(documents[i]._id.toString()).toBe(
          ((expectedFirstPage[i] as any)._id as mongoose.Types.ObjectId).toString()
        );
      }
    }
  );

  // Feature: docket, Property 16
  it('returns HTTP 401 when no JWT is provided', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('documents');
  });

  // Feature: docket, Property 16
  it('returns HTTP 401 when an invalid JWT is provided', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', 'Bearer invalidtoken');
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('documents');
  });

  // Feature: docket, Property 16 — pagination cap
  it('returns at most 50 documents when more than 50 exist', async () => {
    const userId = await createUser('paginate');
    await insertDocumentsForUser(userId, 55, new Date('2024-06-01T00:00:00.000Z'));

    const token = mintToken(userId);
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.documents.length).toBe(50);
    expect(res.body.total).toBe(55);
    expect(res.body.limit).toBe(50);
  });
});
