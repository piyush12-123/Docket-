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
import Notification from '../../models/Notification.js';

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
  // Clear all collections after each test
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

test.prop([
  fc.record({
    userId: fc.hexaString({ minLength: 24, maxLength: 24 }),
    status: fc.constantFrom('processing', 'ready', 'failed'),
    failureReason: fc.string(),
    extractedText: fc.string(),
  })
])('Property 18 — PATCH ignores immutable fields', async (immutablePatch) => {
  const { token } = await registerAndLogin();
  const user = await User.findOne({}).lean();
  const doc = await Document.create({
    userId: user!._id,
    title: 'Original Title',
    originalFilename: 'original.pdf',
    fileUrl: 'https://res.cloudinary.com/test/test.pdf',
    fileType: 'pdf',
    status: 'ready',
  });

  const res = await request(app)
    .patch(`/api/documents/${doc._id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ ...immutablePatch, title: 'New Title' });

  expect(res.status).toBe(200);
  expect(res.body.title).toBe('New Title');        // mutable field changed
  expect(res.body.status).toBe('ready');            // immutable: unchanged
  expect(res.body.fileType).toBe('pdf');            // immutable: unchanged
  expect(String(res.body.userId)).toBe(String(user!._id)); // immutable: unchanged
});

it('Property 19 — ownership check enforced on DELETE, retry, GET', async () => {
  const { token: tokenA } = await registerAndLogin('UserA', 'usera@example.com', 'password123');
  const { token: tokenB } = await registerAndLogin('UserB', 'userb@example.com', 'password123');
  const userA = await User.findOne({ email: 'usera@example.com' }).lean();

  const doc = await Document.create({
    userId: userA!._id,
    title: 'UserA Doc',
    originalFilename: 'doc.pdf',
    fileUrl: 'https://res.cloudinary.com/test/doc.pdf',
    fileType: 'pdf',
    status: 'failed',
  });

  // UserB cannot GET, PATCH, DELETE, or retry UserA's doc
  const getRes = await request(app).get(`/api/documents/${doc._id}`).set('Authorization', `Bearer ${tokenB}`);
  expect(getRes.status).toBe(404);

  const patchRes = await request(app).patch(`/api/documents/${doc._id}`).set('Authorization', `Bearer ${tokenB}`).send({ title: 'Stolen' });
  expect(patchRes.status).toBe(404);

  const deleteRes = await request(app).delete(`/api/documents/${doc._id}`).set('Authorization', `Bearer ${tokenB}`);
  expect(deleteRes.status).toBe(404);

  const retryRes = await request(app).post(`/api/documents/${doc._id}/retry`).set('Authorization', `Bearer ${tokenB}`);
  expect(retryRes.status).toBe(404);

  // UserA CAN access their own doc
  const ownGetRes = await request(app).get(`/api/documents/${doc._id}`).set('Authorization', `Bearer ${tokenA}`);
  expect(ownGetRes.status).toBe(200);
});

test.prop([fc.hexaString({ minLength: 24, maxLength: 24 })])(
  'Property 41 — Non-existent document always returns 404',
  async (randomId) => {
    const { token } = await registerAndLogin();
    // Use a well-formed ObjectId that just doesn't exist
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/documents/${fakeId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  }
);
