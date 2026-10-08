import { vi, beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Must mock BEFORE importing pipeline
vi.mock('../../services/aiService.js', () => ({
  extractTextFromImage: vi.fn().mockResolvedValue('Extracted image text'),
  extractDocumentData: vi.fn().mockResolvedValue({
    documentType: 'certificate',
    suggestedTitle: 'Mock Certificate',
    issueDate: '2024-01-01',
    expiryDate: '2025-01-01',
    amount: null,
    issuer: 'Mock Issuer',
    tags: ['mocked'],
  }),
  answerQuery: vi.fn(),
}));

vi.mock('../../services/pdfService.js', () => ({
  extractText: vi.fn().mockResolvedValue('Extracted PDF text'),
}));

// Mock global fetch (used by ingestionPipeline to download PDF from Cloudinary)
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
}) as unknown as typeof fetch;

// @ts-ignore
import { run } from '../../services/ingestionPipeline.js';
// @ts-ignore
import Document from '../../models/Document.js';
// @ts-ignore
import Notification from '../../models/Notification.js';
// @ts-ignore
import User from '../../models/User.js';

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
  const collections = mongoose.connection.collections; for (const key in collections) { await collections[key].deleteMany({}); }
});

test.prop([fc.constantFrom('pdf', 'image')])(
  'Property 14 — valid AI extraction transitions doc to Ready with correct fields',
  async (fileType) => {
    const user = await User.create({ name: 'Test', email: `ir-${Date.now()}@test.com`, passwordHash: '$2b$12$AAA' });

    const doc = await Document.create({
      userId: user._id,
      title: 'Pending Title',
      originalFilename: `doc.${fileType === 'pdf' ? 'pdf' : 'jpg'}`,
      fileUrl: 'https://res.cloudinary.com/test/sample.pdf',
      fileType,
      status: 'processing',
    });

    await run(doc); // await directly — not fire-and-forget in tests

    const updated = await Document.findById(doc._id);
    expect(updated!.status).toBe('ready');
    expect(updated!.documentType).toBe('certificate');
    expect(updated!.title).toBe('Mock Certificate');
    expect(updated!.issuer).toBe('Mock Issuer');
    expect(updated!.tags).toContain('mocked');

    const notif = await Notification.findOne({ userId: user._id, type: 'processing_complete' });
    expect(notif).not.toBeNull();
  }
);
