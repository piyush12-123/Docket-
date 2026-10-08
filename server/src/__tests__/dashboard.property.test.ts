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
import Document from '../../models/Document.js';

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

it('Property 35 — dashboard stats scoped to caller only', async () => {
  const { token: tokenA } = await registerAndLogin('A', 'da@example.com', 'password123');
  await registerAndLogin('B', 'db@example.com', 'password123');
  const userA = await User.findOne({ email: 'da@example.com' }).lean();
  const userB = await User.findOne({ email: 'db@example.com' }).lean();

  for (let i = 0; i < 5; i++) {
    await Document.create({ userId: userA!._id, title: `Doc ${i}`, originalFilename: 'a.pdf', fileUrl: 'https://x.com/a.pdf', fileType: 'pdf', status: 'ready' });
  }
  for (let i = 0; i < 3; i++) {
    await Document.create({ userId: userB!._id, title: `Doc ${i}`, originalFilename: 'b.pdf', fileUrl: 'https://x.com/b.pdf', fileType: 'pdf', status: 'ready' });
  }

  const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${tokenA}`);
  expect(res.status).toBe(200);
  expect(res.body.totalCount).toBe(5);
});

test.prop([
  fc.array(fc.constantFrom('ready', 'processing', 'failed'), { minLength: 1, maxLength: 20 })
])(
  'Property 36 — statusCounts sum equals totalCount',
  async (statuses) => {
    const { token } = await registerAndLogin();
    const user = await User.findOne({}).lean();

    for (const status of statuses) {
      await Document.create({ userId: user!._id, title: 'D', originalFilename: 'f.pdf', fileUrl: 'https://x.com/f.pdf', fileType: 'pdf', status });
    }

    const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const { statusCounts, totalCount } = res.body;
    expect(statusCounts.ready + statusCounts.processing + statusCounts.failed).toBe(totalCount);
  }
);

it('Property 37 — expiringCount matches docs expiring within 30 days', async () => {
  const { token } = await registerAndLogin();
  const user = await User.findOne({}).lean();
  const uid = String(user!._id);

  const now = new Date();
  function daysFrom(n: number) { return new Date(now.getTime() + n * 86400000); }

  // Expiring within 30 days (ready status)
  await Document.create({ userId: uid, title: 'A', originalFilename: 'a.pdf', fileUrl: 'https://x.com/a.pdf', fileType: 'pdf', status: 'ready', expiryDate: daysFrom(5) });
  await Document.create({ userId: uid, title: 'B', originalFilename: 'b.pdf', fileUrl: 'https://x.com/b.pdf', fileType: 'pdf', status: 'ready', expiryDate: daysFrom(29) });
  // Outside 30 days
  await Document.create({ userId: uid, title: 'C', originalFilename: 'c.pdf', fileUrl: 'https://x.com/c.pdf', fileType: 'pdf', status: 'ready', expiryDate: daysFrom(45) });
  // Not ready
  await Document.create({ userId: uid, title: 'D', originalFilename: 'd.pdf', fileUrl: 'https://x.com/d.pdf', fileType: 'pdf', status: 'processing', expiryDate: daysFrom(5) });
  // No expiry
  await Document.create({ userId: uid, title: 'E', originalFilename: 'e.pdf', fileUrl: 'https://x.com/e.pdf', fileType: 'pdf', status: 'ready', expiryDate: null });

  const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.expiringCount).toBe(2); // Only A and B qualify
});
