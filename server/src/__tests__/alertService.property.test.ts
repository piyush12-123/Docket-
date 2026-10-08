import { vi, beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

vi.mock('../../services/emailService.js', () => ({
  sendExpiryAlert: vi.fn().mockResolvedValue({ messageId: 'mock-id' }),
}));

// @ts-ignore
import { alertJob } from '../../jobs/alertJob.js';
// @ts-ignore
import Document from '../../models/Document.js';
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
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections; for (const key in collections) { await collections[key].deleteMany({}); }
});

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function createUser() {
  return User.create({ name: 'Test', email: `u-${Date.now()}@test.com`, passwordHash: '$2b$12$AAA' });
}

async function createDocWithExpiry(userId: string, daysAway: number, status = 'ready', alertsSent: string[] = []) {
  return Document.create({
    userId,
    title: `Doc expiring in ${daysAway} days`,
    originalFilename: 'doc.pdf',
    fileUrl: 'https://x.com/doc.pdf',
    fileType: 'pdf',
    status,
    expiryDate: daysFromNow(daysAway),
    alertsSent,
  });
}

it('Property 27 — alertJob notifies docs within threshold only', async () => {
  const user = await createUser();
  const uid = String(user._id);

  await createDocWithExpiry(uid, 25);   // in 30-day zone → should notify
  await createDocWithExpiry(uid, 5);    // in 7-day zone → should notify
  await createDocWithExpiry(uid, 0);    // in 1-day zone → should notify
  await createDocWithExpiry(uid, 45);   // outside 30 days → NO notification
  await createDocWithExpiry(uid, -2);   // already expired → NO notification

  await alertJob();

  const notifications = await Notification.find({ userId: uid });
  expect(notifications.length).toBe(3);
  for (const n of notifications) {
    expect(n.type).toBe('expiry_alert');
  }
});

it('Property 28 — alertJob skips already-sent threshold', async () => {
  const user = await createUser();
  const uid = String(user._id);

  // 5-day doc with 7day already sent
  await createDocWithExpiry(uid, 5, 'ready', ['7day']);

  await alertJob();

  const notifications = await Notification.find({ userId: uid });
  expect(notifications.length).toBe(0); // no new notification created

  const doc = await Document.findOne({ userId: uid });
  expect(doc!.alertsSent).toContain('7day');
  expect(doc!.alertsSent.length).toBe(1); // still only 1 — not duplicated
});

it('Property 29 — alertJob skips past-expired documents', async () => {
  const user = await createUser();
  const uid = String(user._id);

  await createDocWithExpiry(uid, -5, 'ready', []); // expired 5 days ago

  await alertJob();

  const notifications = await Notification.find({ userId: uid });
  expect(notifications.length).toBe(0);
});
