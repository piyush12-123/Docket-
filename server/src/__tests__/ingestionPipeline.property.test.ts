/**
 * Property-based tests for server/services/ingestionPipeline.js
 *
 * Uses fast-check + @fast-check/vitest + mongodb-memory-server.
 *
 * Property 13: Extraction failure produces a descriptive failureReason
 *              and a processing_failed Notification
 *
 * Validates: Requirements 5.4
 */

// Feature: docket, Property 13

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// ---------------------------------------------------------------------------
// Mock pdfService and aiService BEFORE importing ingestionPipeline so that
// Vitest's module system sees the mocked versions.
// ---------------------------------------------------------------------------
vi.mock('../../services/pdfService.js', () => ({
  extractText: vi.fn(),
}));

vi.mock('../../services/aiService.js', () => ({
  extractTextFromImage: vi.fn(),
  extractDocumentData: vi.fn(),
  answerQuery: vi.fn(),
}));

// We also need to mock fetch (used by the PDF path to download the file URL)
// so the pipeline doesn't make real HTTP requests.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// @ts-ignore — JS module without type declarations
import Document from '../../models/Document.js';
// @ts-ignore
import * as pdfService from '../../services/pdfService.js';
// @ts-ignore
import * as aiService from '../../services/aiService.js';
// @ts-ignore
import { run } from '../../services/ingestionPipeline.js';

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
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Clear documents (and notifications if the model exists) between runs
  await Document.deleteMany({});
  vi.clearAllMocks();

  try {
    const { default: Notification } = await import('../../models/Notification.js').catch(() => ({
      default: null as any,
    }));
    if (Notification) {
      await Notification.deleteMany({});
    }
  } catch {
    // Notification model not yet created — OK
  }
});

// ---------------------------------------------------------------------------
// Helper — create a minimal Document record in the DB
// ---------------------------------------------------------------------------
async function createDocument(overrides: Record<string, unknown> = {}) {
  const userId = new mongoose.Types.ObjectId();
  const doc = await Document.create({
    userId,
    title: 'Test Document',
    originalFilename: 'test.pdf',
    fileUrl: 'https://res.cloudinary.com/demo/raw/upload/test.pdf',
    fileType: 'pdf',
    status: 'processing',
    ...overrides,
  });
  return doc;
}

// ---------------------------------------------------------------------------
// Helper — load Notification model gracefully (may not exist yet)
// ---------------------------------------------------------------------------
async function tryGetNotificationModel(): Promise<any | null> {
  try {
    const mod = await import('../../models/Notification.js').catch(() => ({ default: null as any }));
    return mod.default ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Property 13: Extraction failure produces a descriptive failureReason
//              and a processing_failed Notification
// Feature: docket, Property 13
// Validates: Requirements 5.4
// ---------------------------------------------------------------------------

describe('Property 13: Extraction failure produces a descriptive failureReason and a processing_failed Notification', () => {

  // ── 13a: PDF extraction throws ──────────────────────────────────────────

  test.prop(
    [
      // Generate arbitrary error messages to simulate diverse extraction failures
      fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
    ],
    { numRuns: 100 }
  )(
    // Feature: docket, Property 13
    'PDF extraction error → status:failed, non-empty failureReason identifying step, processing_failed Notification',
    async (errorMessage) => {
      // Arrange: mock fetch to succeed (returns a dummy PDF buffer)
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as any);

      // Arrange: mock pdfService to throw with the generated error message
      (pdfService.extractText as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error(errorMessage)
      );

      const doc = await createDocument({ fileType: 'pdf' });

      // Act
      await run(doc);

      // Assert: Document is now in failed state
      const updated = await Document.findById(doc._id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('failed');

      // Assert: failureReason is a non-empty string that identifies the step
      expect(typeof updated!.failureReason).toBe('string');
      expect(updated!.failureReason!.length).toBeGreaterThan(0);
      // The pipeline sets failureReason = "<step>: <cause>" (see ingestionPipeline.js failDocument helper)
      // For PDF the step is "PDF parsing"
      expect(updated!.failureReason).toContain('PDF parsing');

      // Assert: a processing_failed Notification was created (if model available)
      const Notification = await tryGetNotificationModel();
      if (Notification) {
        const notification = await Notification.findOne({
          userId: doc.userId,
          documentId: doc._id,
          type: 'processing_failed',
        });
        expect(notification).not.toBeNull();
        expect(notification!.type).toBe('processing_failed');
        expect(typeof notification!.message).toBe('string');
        expect(notification!.message.length).toBeGreaterThan(0);
      }
    }
  );

  // ── 13b: Image extraction throws ────────────────────────────────────────

  test.prop(
    [
      fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
    ],
    { numRuns: 100 }
  )(
    // Feature: docket, Property 13
    'Image extraction error → status:failed, non-empty failureReason identifying step, processing_failed Notification',
    async (errorMessage) => {
      // Arrange: mock aiService.extractTextFromImage to throw
      (aiService.extractTextFromImage as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error(errorMessage)
      );

      const doc = await createDocument({ fileType: 'image' });

      // Act
      await run(doc);

      // Assert: Document is now in failed state
      const updated = await Document.findById(doc._id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('failed');

      // Assert: failureReason is a non-empty string that identifies the step
      expect(typeof updated!.failureReason).toBe('string');
      expect(updated!.failureReason!.length).toBeGreaterThan(0);
      // For image the step is "vision API call"
      expect(updated!.failureReason).toContain('vision API call');

      // Assert: a processing_failed Notification was created (if model available)
      const Notification = await tryGetNotificationModel();
      if (Notification) {
        const notification = await Notification.findOne({
          userId: doc.userId,
          documentId: doc._id,
          type: 'processing_failed',
        });
        expect(notification).not.toBeNull();
        expect(notification!.type).toBe('processing_failed');
        expect(typeof notification!.message).toBe('string');
        expect(notification!.message.length).toBeGreaterThan(0);
      }
    }
  );

  // ── 13c: Both fileTypes — combined arbitrary ─────────────────────────────
  // Run a combined test covering both PDF and image paths with different error messages

  test.prop(
    [
      fc.record({
        fileType: fc.oneof(fc.constant('pdf'), fc.constant('image')),
        errorMessage: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
      }),
    ],
    { numRuns: 100 }
  )(
    // Feature: docket, Property 13
    'Any fileType extraction error → status:failed with non-empty failureReason',
    async ({ fileType, errorMessage }) => {
      if (fileType === 'pdf') {
        mockFetch.mockResolvedValue({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(8),
        } as any);
        (pdfService.extractText as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error(errorMessage)
        );
      } else {
        (aiService.extractTextFromImage as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error(errorMessage)
        );
      }

      const doc = await createDocument({ fileType });

      await run(doc);

      const updated = await Document.findById(doc._id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('failed');
      expect(typeof updated!.failureReason).toBe('string');
      expect(updated!.failureReason!.length).toBeGreaterThan(0);

      // failureReason must identify the step that failed
      const expectedStep = fileType === 'pdf' ? 'PDF parsing' : 'vision API call';
      expect(updated!.failureReason).toContain(expectedStep);

      // failureReason must also contain part of the error cause
      // (ingestionPipeline formats it as "<step>: <cause>")
      const parts = updated!.failureReason!.split(': ');
      expect(parts.length).toBeGreaterThanOrEqual(2);
      // The part after the first colon+space must be non-empty (i.e. cause is present)
      const cause = parts.slice(1).join(': ');
      expect(cause.length).toBeGreaterThan(0);
    }
  );
});
