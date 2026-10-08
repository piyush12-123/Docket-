import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// @ts-ignore
import { app } from '../../index.js';
// @ts-ignore
import User from '../../models/User.js';
// @ts-ignore
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

async function createNotification(userId: string, overrides = {}) {
  return Notification.create({
    userId,
    message: 'Test notification',
    type: 'processing_complete',
    read: false,
    ...overrides,
  });
}

it('Property 30 — notifications scoped to authenticated user', async () => {
  const { token: tokenA } = await registerAndLogin('A', 'na@example.com', 'password123');
  const { token: tokenB } = await registerAndLogin('B', 'nb@example.com', 'password123');
  const userA = await User.findOne({ email: 'na@example.com' }).lean();
  const userB = await User.findOne({ email: 'nb@example.com' }).lean();

  await createNotification(String(userA!._id));
  await createNotification(String(userA!._id));
  await createNotification(String(userB!._id));

  const res = await request(app)
    .get('/api/notifications')
    .set('Authorization', `Bearer ${tokenA}`);

  expect(res.status).toBe(200);
  expect(res.body.length).toBe(2);
  for (const notif of res.body) {
    expect(String(notif.userId)).toBe(String(userA!._id));
  }
});

it('Property 31 — mark-single-read only marks that notification', async () => {
  const { token } = await registerAndLogin();
  const user = await User.findOne({}).lean();

  const [n1, n2, n3] = await Promise.all([
    createNotification(String(user!._id)),
    createNotification(String(user!._id)),
    createNotification(String(user!._id)),
  ]);

  const res = await request(app)
    .patch(`/api/notifications/${n1._id}/read`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body.read).toBe(true);

  const stillUnread = await Notification.find({ _id: { $in: [n2._id, n3._id] } });
  for (const n of stillUnread) {
    expect(n.read).toBe(false);
  }
});

it('Property 31b — marking another user\'s notification returns 404', async () => {
  const { token: tokenA } = await registerAndLogin('A2', 'a2@example.com', 'password123');
  const { token: tokenB } = await registerAndLogin('B2', 'b2@example.com', 'password123');
  const userA = await User.findOne({ email: 'a2@example.com' }).lean();

  const notif = await createNotification(String(userA!._id));

  const res = await request(app)
    .patch(`/api/notifications/${notif._id}/read`)
    .set('Authorization', `Bearer ${tokenB}`);

  expect(res.status).toBe(404);
});

test.prop([fc.integer({ min: 1, max: 10 })])(
  'Property 32 — mark-all-read sets all notifications read',
  async (count) => {
    const { token } = await registerAndLogin();
    const user = await User.findOne({}).lean();

    for (let i = 0; i < count; i++) {
      await createNotification(String(user!._id));
    }

    const markRes = await request(app)
      .patch('/api/notifications/mark-all-read')
      .set('Authorization', `Bearer ${token}`);

    expect(markRes.status).toBe(200);
    expect(markRes.body.count).toBe(count);

    const remaining = await Notification.find({ userId: user!._id, read: false });
    expect(remaining.length).toBe(0);
  }
);
