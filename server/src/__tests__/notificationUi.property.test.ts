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

test.prop([fc.integer({ min: 1, max: 15 }), fc.integer({ min: 0, max: 15 })])(
  'Property 33 — unreadOnly=true returns only unread notifications',
  async (total, readCount) => {
    const actualRead = Math.min(readCount, total);
    const { token } = await registerAndLogin();
    const user = await User.findOne({}).lean();

    for (let i = 0; i < total; i++) {
      await Notification.create({
        userId: user!._id,
        message: 'Test',
        type: 'processing_complete',
        read: i < actualRead, // first `actualRead` are read, rest are unread
      });
    }

    const res = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const expectedUnread = total - actualRead;
    expect(res.body.length).toBe(expectedUnread);
    for (const n of res.body) {
      expect(n.read).toBe(false);
    }
  }
);

test.prop([fc.integer({ min: 1, max: 15 })])(
  'Property 34 — mark-all-read zeroes unread count',
  async (count) => {
    const { token } = await registerAndLogin();
    const user = await User.findOne({}).lean();

    for (let i = 0; i < count; i++) {
      await Notification.create({ userId: user!._id, message: 'T', type: 'processing_complete', read: false });
    }

    await request(app).patch('/api/notifications/mark-all-read').set('Authorization', `Bearer ${token}`);

    const res = await request(app).get('/api/notifications?unreadOnly=true').set('Authorization', `Bearer ${token}`);
    expect(res.body.length).toBe(0);
  }
);
