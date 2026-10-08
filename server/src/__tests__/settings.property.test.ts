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

it('Property 38 — profile update persists name and email', async () => {
  const { token } = await registerAndLogin('Old Name', 'old@example.com', 'password123');

  const res = await request(app)
    .patch('/api/settings/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'New Name', email: 'new@example.com' });

  expect(res.status).toBe(200);
  expect(res.body.user.name).toBe('New Name');
  expect(res.body.user.email).toBe('new@example.com');

  const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  expect(meRes.body.name).toBe('New Name');
});

it('Property 38b — duplicate email on profile update returns 409', async () => {
  await registerAndLogin('User1', 'taken@example.com', 'password123');
  const { token } = await registerAndLogin('User2', 'user2@example.com', 'password123');

  const res = await request(app)
    .patch('/api/settings/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ email: 'taken@example.com' });

  expect(res.status).toBe(409);
});

it('Property 39 — password change: old rejected, new works', async () => {
  const { token } = await registerAndLogin('PWUser', 'pwuser@example.com', 'OldPass1!');

  const changeRes = await request(app)
    .patch('/api/settings/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass2@' });
  expect(changeRes.status).toBe(200);

  // Old password no longer works
  const oldLoginRes = await request(app).post('/api/auth/login').send({ email: 'pwuser@example.com', password: 'OldPass1!' });
  expect(oldLoginRes.status).toBe(401);

  // New password works
  const newLoginRes = await request(app).post('/api/auth/login').send({ email: 'pwuser@example.com', password: 'NewPass2@' });
  expect(newLoginRes.status).toBe(200);
});

it('Property 39b — wrong currentPassword returns 401', async () => {
  const { token } = await registerAndLogin('PW2', 'pw2@example.com', 'password123');

  const res = await request(app)
    .patch('/api/settings/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword456' });
  expect(res.status).toBe(401);
});

it('Property 40 — account deletion removes all user data', async () => {
  const { token } = await registerAndLogin('DelUser', 'del@example.com', 'password123');
  const user = await User.findOne({ email: 'del@example.com' }).lean();
  const uid = String(user!._id);

  await Document.create([
    { userId: uid, title: 'D1', originalFilename: 'd1.pdf', fileUrl: 'https://x.com/d1.pdf', fileType: 'pdf', status: 'ready' },
    { userId: uid, title: 'D2', originalFilename: 'd2.pdf', fileUrl: 'https://x.com/d2.pdf', fileType: 'pdf', status: 'ready' },
  ]);
  await Notification.create([
    { userId: uid, message: 'N1', type: 'processing_complete' },
    { userId: uid, message: 'N2', type: 'expiry_alert' },
  ]);

  const delRes = await request(app).delete('/api/settings/account').set('Authorization', `Bearer ${token}`);
  expect(delRes.status).toBe(200);

  expect(await User.findById(uid)).toBeNull();
  expect(await Document.countDocuments({ userId: uid })).toBe(0);
  expect(await Notification.countDocuments({ userId: uid })).toBe(0);
});
