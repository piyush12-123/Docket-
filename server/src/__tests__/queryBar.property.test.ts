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

test.prop([fc.string({ minLength: 501, maxLength: 1000 })])(
  'Property 26a — question > 500 chars returns 400',
  async (longQuestion) => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/documents/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: longQuestion });
    expect(res.status).toBe(400);
  }
);

it('Property 26b — empty question returns 400', async () => {
  const { token } = await registerAndLogin();
  const res = await request(app)
    .post('/api/documents/query')
    .set('Authorization', `Bearer ${token}`)
    .send({ question: '' });
  expect(res.status).toBe(400);
});

it('Property 26c — missing question field returns 400', async () => {
  const { token } = await registerAndLogin();
  const res = await request(app)
    .post('/api/documents/query')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  expect(res.status).toBe(400);
});

test.prop([fc.string({ minLength: 1, maxLength: 500 })])(
  'Property 26d — valid question (1–500 chars) returns 200',
  async (question) => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/documents/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ question });
    expect(res.status).toBe(200);
  }
);
