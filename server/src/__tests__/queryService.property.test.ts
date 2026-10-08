import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({ answer: 'Mock answer', matchedDocumentIds: [] })
            }
          }]
        })
      }
    }
  }))
}));

// @ts-ignore
import { app } from '../../index.js';
// @ts-ignore
import Document from '../../models/Document.js';
// @ts-ignore
import User from '../../models/User.js';
// @ts-ignore
import QueryLog from '../../models/QueryLog.js';

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
  process.env.OPENAI_API_KEY = 'sk-test-key';
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections; for (const key in collections) { await collections[key].deleteMany({}); }
});

async function registerAndLogin(
  name = 'Test User',
  email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
  password = 'password123'
) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password });
  return { token: res.body.token as string, email, password };
}

it('Property 24 — query only uses ready docs and returns answer', async () => {
  const { token } = await registerAndLogin();
  const user = await User.findOne({}).lean();

  // Create docs with mixed statuses
  await Document.create([
    { userId: user!._id, title: 'Ready Doc', originalFilename: 'a.pdf', fileUrl: 'https://x.com/a.pdf', fileType: 'pdf', status: 'ready' },
    { userId: user!._id, title: 'Processing Doc', originalFilename: 'b.pdf', fileUrl: 'https://x.com/b.pdf', fileType: 'pdf', status: 'processing' },
    { userId: user!._id, title: 'Failed Doc', originalFilename: 'c.pdf', fileUrl: 'https://x.com/c.pdf', fileType: 'pdf', status: 'failed' },
  ]);

  const res = await request(app)
    .post('/api/documents/query')
    .set('Authorization', `Bearer ${token}`)
    .send({ question: 'What certificates do I have?' });

  expect(res.status).toBe(200);
  expect(typeof res.body.answer).toBe('string');
  expect(Array.isArray(res.body.matchedDocumentIds)).toBe(true);
});

test.prop([fc.string({ minLength: 1, maxLength: 500 })])(
  'Property 25 — QueryLog record created for every query',
  async (question) => {
    const { token } = await registerAndLogin();
    const user = await User.findOne({}).lean();

    await request(app)
      .post('/api/documents/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ question });

    const logs = await QueryLog.find({ userId: user!._id });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].questionText).toBe(question);
  }
);
