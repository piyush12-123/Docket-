import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// @ts-ignore
import { app } from '../../index.js';
// @ts-ignore
import Document from '../../models/Document.js';
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
  process.env.JWT_SECRET = 'test-jwt-secret-docket';
  process.env.OPENAI_API_KEY = 'sk-test-key';

  await Document.syncIndexes(); // ← REQUIRED for $text search in tests
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Document.deleteMany({});
  await User.deleteMany({});
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

async function createReadyDoc(userId: string, overrides = {}) {
  return Document.create({
    userId,
    title: 'Searchable Document',
    originalFilename: 'doc.pdf',
    fileUrl: 'https://res.cloudinary.com/test/doc.pdf',
    fileType: 'pdf',
    status: 'ready',
    extractedText: 'findme alpha beta gamma',
    documentType: 'certificate',
    tags: ['test-tag'],
    ...overrides,
  });
}

it('Property 20 — Search only returns caller\'s documents', async () => {
  const { token: tokenA } = await registerAndLogin('A', 'a@example.com', 'password123');
  const { token: tokenB } = await registerAndLogin('B', 'b@example.com', 'password123');
  const userA = await User.findOne({ email: 'a@example.com' }).lean();
  const userB = await User.findOne({ email: 'b@example.com' }).lean();

  await createReadyDoc(String(userA!._id), { extractedText: 'uniquekeyword' });
  await createReadyDoc(String(userA!._id), { extractedText: 'uniquekeyword' });
  await createReadyDoc(String(userB!._id), { extractedText: 'uniquekeyword' });

  const res = await request(app)
    .get('/api/documents/search?q=uniquekeyword')
    .set('Authorization', `Bearer ${tokenA}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  // All results must belong to userA
  for (const doc of res.body) {
    expect(String(doc.userId)).toBe(String(userA!._id));
  }
  // UserB's doc should NOT appear
  expect(res.body.length).toBe(2);
});

test.prop([fc.constantFrom('id', 'certificate', 'contract', 'invoice', 'insurance', 'warranty', 'other')])(
  'Property 21 — type filter restricts search results to that type',
  async (filterType) => {
    const { token } = await registerAndLogin();
    const user = await User.findOne({}).lean();
    const uid = String(user!._id);

    await createReadyDoc(uid, { documentType: filterType, extractedText: 'searchterm' });
    await createReadyDoc(uid, { documentType: 'other', extractedText: 'searchterm' });

    const res = await request(app)
      .get(`/api/documents/search?q=searchterm&type=${filterType}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    for (const doc of res.body) {
      expect(doc.documentType).toBe(filterType);
    }
  }
);

it('Property 22 — combined type + tag filter is AND logic', async () => {
  const { token } = await registerAndLogin();
  const user = await User.findOne({}).lean();
  const uid = String(user!._id);

  // One doc matches type AND tag
  await createReadyDoc(uid, { documentType: 'certificate', tags: ['work'], extractedText: 'combined' });
  // One matches type but not tag
  await createReadyDoc(uid, { documentType: 'certificate', tags: ['personal'], extractedText: 'combined' });
  // One matches tag but not type
  await createReadyDoc(uid, { documentType: 'invoice', tags: ['work'], extractedText: 'combined' });

  const res = await request(app)
    .get('/api/documents/search?q=combined&type=certificate&tag=work')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body.length).toBe(1);
  expect(res.body[0].documentType).toBe('certificate');
  expect(res.body[0].tags).toContain('work');
});

it('GET /api/documents/search?q=a (1 char) -> expect 400', async () => {
  const { token } = await registerAndLogin();
  const res = await request(app)
    .get('/api/documents/search?q=a')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(400);
});
