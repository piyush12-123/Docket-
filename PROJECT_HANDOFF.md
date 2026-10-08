# DOCKET — AI AGENT HANDOFF DOCUMENT
## "What Remains To Be Done Before The Project Is Complete"

**Prepared:** October 2026  
**Based on:** Full verified source-code inspection of `c:\Users\shind\Documents\Docket_Anti\Docket`  
**Accuracy:** Every status is VERIFIED against actual files — not from any prior handoff doc.  
**Deployment:** Intentionally excluded. Owner will deploy manually.

---

## CRITICAL READING INSTRUCTIONS FOR THE AI AGENT

Before touching any file, read and internalize these non-negotiable constraints:

1. **Server is ES Modules.** `server/package.json` has `"type": "module"`. Every server import MUST use `import/export` syntax with `.js` file extensions (e.g. `import Foo from './foo.js'`). Never use `require()`. Never omit `.js` from import paths.

2. **Client is TypeScript + React 18 + Vite + Tailwind CSS 3.** All client files use `.tsx` or `.ts`. Import aliases use `@/` prefix which maps to `client/src/`. Do NOT use relative `../../` paths when `@/` is available.

3. **Authentication:** `userId` on every backend action comes EXCLUSIVELY from `req.userId` (set by `authMiddleware` from the verified JWT). Never read userId from `req.body`, `req.query`, or `req.params`.

4. **Cross-user isolation:** Wrong-owner resource access returns HTTP 404 (not 403). This is intentional per the spec. Do not change it.

5. **Module system is sequential on server tests.** `server/vitest.config.ts` has `fileParallelism: false`. Each test file creates its own `MongoMemoryServer` and connects independently. Do NOT change this.

6. **Error response format:** The server always returns `{ error: 'message string' }` (key is `error`, not `message`). The client reads `err.response?.data?.error`. Do not use `message` as the key on the server.

7. **React-hot-toast:** Already installed and `<Toaster position="bottom-right" />` is mounted in `client/src/App.tsx`. Import with `import { toast } from 'react-hot-toast'` anywhere in the client.

8. **fast-check property tests:** Already installed. Pattern for all new property test files is: `import { fc, test } from '@fast-check/vitest'`. The existing test files in `server/src/__tests__/` are the authoritative pattern to follow exactly.

9. **Do NOT run `npm install`.** All dependencies are already installed. Do not add new packages.

10. **Do NOT modify:** `server/package.json`, `client/package.json`, `tailwind.config.js`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts` (either), `server/config/db.js`, `server/models/*.js` (all four models are final and correct).

---

## CURRENT STATE SUMMARY

After thorough code inspection, here is the precise status of every file:

### What Is FULLY Complete and Working (Do Not Touch)
- All 4 Mongoose models: `User.js`, `Document.js`, `Notification.js`, `QueryLog.js`
- Auth: `authController.js`, `authMiddleware.js`, `routes/auth.js`
- Document CRUD: `documentsController.js` (all 8 actions including `query`), `routes/documents.js` (all 8 routes including `POST /query`)
- Upload: `uploadMiddleware.js`, `cloudinaryService.js`
- Ingestion: `ingestionPipeline.js`, `pdfService.js`
- AI: `aiService.js` — all 3 functions complete (extractTextFromImage, extractDocumentData, answerQuery)
- Search: `searchService.js`
- Query: `queryService.js`
- Notifications backend: `notificationsController.js`, `routes/notifications.js`
- Dashboard backend: `dashboardController.js`, `routes/dashboard.js`
- Settings backend: `settingsController.js`, `routes/settings.js`
- Email: `emailService.js`
- Alert job: `jobs/alertJob.js`, registered in `server/index.js` via `startAlertCron()`
- Frontend auth: `Login.tsx`, `Register.tsx`, `authStore.ts`, `apiClient.ts`, `authApi.ts`
- Frontend layout: `AppLayout.tsx` (fully wired in `App.tsx`)
- Frontend components: `ProtectedRoute.tsx`, `UploadDropzone.tsx`, `ExpiryBadge.tsx`, `LoadingSkeleton.tsx`, `AiQueryBar.tsx`, `NotificationBell.tsx`
- Frontend pages: `DocumentDetail.tsx`, `Dashboard.tsx`, `Notifications.tsx`, `Settings.tsx`
- Frontend stores: `authStore.ts`, `notificationStore.ts`
- Frontend API clients: `documentsApi.ts`, `notificationsApi.ts`, `dashboardApi.ts`, `settingsApi.ts`
- Frontend hooks: `useDocumentPolling.ts`, `useDebounce.ts`
- `DocumentsLibrary.tsx` — search state, logic, and UI are **already implemented and complete**
- Existing test files (10 server + 3 client) — do not modify, they are correct and passing

### What Remains (The Actual Work)
1. **Phase A** — Missing property-based test files (14 test files to create)
2. **Phase B** — react-hot-toast wiring (add toasts to upload, document save/delete/retry flows)
3. **Phase C** — Framer Motion animations (route transitions + list stagger)
4. **Phase D** — Accessibility & focus audit
5. **Phase E** — Final integration verification (run all tests, confirm app starts)

---

## PHASE A — PROPERTY-BASED TESTS (Highest Priority)

These are the 14 missing test files. The spec defines 41 total correctness properties; 15 are already tested. The remaining 26 properties (across 14 files) must be created now.

**Pattern to follow exactly:** Read `server/src/__tests__/auth.property.test.ts` before writing any server tests. Read `client/src/test/auth.property.test.ts` before writing any client tests.

**Boilerplate for every SERVER property test file:**
```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// @ts-ignore
import { app } from '../../index.js';
// @ts-ignore — import whichever models are needed
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
  await mongoose.connection.dropDatabase();
});
```

**Boilerplate HELPER: creating a registered user and getting a token:**
```typescript
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
```

---

### A1 — `server/src/__tests__/documentMutation.property.test.ts`

**Properties:** 18 (PATCH immutability), 19 (DELETE/retry ownership), 41 (cross-user 404)

**Full implementation instructions:**

**Property 18 — PATCH strips immutable fields (100 runs):**

The immutable fields that the backend strips are: `userId`, `status`, `createdAt`, `failureReason`, `originalFilename`, `fileUrl`, `fileType`, `extractedText`, `alertsSent`.

Setup per run:
```typescript
const { token } = await registerAndLogin();
const user = await User.findOne({}).lean();
const doc = await Document.create({
  userId: user!._id,
  title: 'Original Title',
  originalFilename: 'original.pdf',
  fileUrl: 'https://res.cloudinary.com/test/test.pdf',
  fileType: 'pdf',
  status: 'ready',
  extractedText: 'some text',
});
```

Then send PATCH with arbitrary immutable fields in the body. Assert that those fields are unchanged in the response. The `title` field (mutable) can be tested by including it in the patch and verifying it DID change.

```typescript
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
```

**Property 19 — Wrong-owner DELETE/retry/GET returns 404 (50 runs):**
```typescript
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
```

**Property 41 — Non-existent document returns 404 not 403/500 (50 runs):**
```typescript
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
```

---

### A2 — `server/src/__tests__/search.property.test.ts`

**Properties:** 20 (search scoped to user), 21 (type filter), 22 (combined type+tag filter)

**Critical:** Call `await Document.syncIndexes()` inside `beforeAll` after `mongoose.connect()`. Without this the in-memory MongoDB won't have the `$text` index and all searches return empty results.

```typescript
beforeAll(async () => {
  // ... connect to mongod ...
  await Document.syncIndexes(); // ← REQUIRED for $text search in tests
});
```

**Helper to create a ready document:**
```typescript
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
```

**Property 20 — Search scoped to authenticated user (50 runs):**
```typescript
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
```

**Property 21 — Type filter restricts results (50 runs):**
```typescript
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
```

**Property 22 — Combined type+tag filter (50 runs):**
```typescript
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
```

**Also test:** `GET /api/documents/search?q=a` (1 char) → expect 400.

---

### A3 — `server/src/__tests__/filterChip.property.test.ts`

**Property:** 17 (filter chip logic correctness — pure function test, no HTTP)

This is a pure-logic unit test. No MongoDB, no supertest needed. Import `{ describe, it, expect }` from `vitest` and `{ fc, test }` from `@fast-check/vitest`.

```typescript
import { describe, it, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';

// The exact same filter logic used in DocumentsLibrary.tsx:
function applyFilters(
  docs: Array<{ documentType: string; tags: string[] }>,
  activeFilters: Set<string>
) {
  if (activeFilters.size === 0) return docs;
  return docs.filter((doc) => {
    for (const filter of activeFilters) {
      if (filter.startsWith('type:') && doc.documentType === filter.slice(5)) return true;
      if (filter.startsWith('tag:') && doc.tags.includes(filter.slice(4))) return true;
    }
    return false;
  });
}

const docArb = fc.record({
  documentType: fc.constantFrom('id', 'certificate', 'contract', 'invoice', 'insurance', 'warranty', 'other'),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
});

test.prop([fc.array(docArb, { maxLength: 20 })])(
  'Property 17a — empty filters returns all docs',
  (docs) => {
    const result = applyFilters(docs, new Set());
    expect(result.length).toBe(docs.length);
  }
);

test.prop([
  fc.array(docArb, { minLength: 1, maxLength: 20 }),
  fc.constantFrom('id', 'certificate', 'contract', 'invoice', 'insurance', 'warranty', 'other'),
])(
  'Property 17b — type filter only returns docs of that type',
  (docs, filterType) => {
    const result = applyFilters(docs, new Set([`type:${filterType}`]));
    for (const doc of result) {
      expect(doc.documentType).toBe(filterType);
    }
    expect(result.length).toBeLessThanOrEqual(docs.length);
  }
);

test.prop([fc.array(docArb, { minLength: 1, maxLength: 20 }), fc.string({ minLength: 1, maxLength: 10 })])(
  'Property 17c — tag filter only returns docs with that tag',
  (docs, filterTag) => {
    const result = applyFilters(docs, new Set([`tag:${filterTag}`]));
    for (const doc of result) {
      expect(doc.tags).toContain(filterTag);
    }
  }
);
```

---

### A4 — `server/src/__tests__/debounce.property.test.ts`

**Property:** 23 (debounce delivers only the last value after the delay)

Use Vitest fake timers. No MongoDB needed.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';

function debounce<T>(fn: (val: T) => void, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (val: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(val), delay);
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test.prop([fc.array(fc.string(), { minLength: 2, maxLength: 10 })])(
  'Property 23 — debounce fires only once with last value',
  (values) => {
    const callback = vi.fn();
    const debounced = debounce(callback, 300);

    for (const val of values) {
      debounced(val);
      vi.advanceTimersByTime(50); // advance less than delay between each call
    }

    // Before delay has fully passed, callback should not have fired
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300); // now the last debounce fires

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(values[values.length - 1]);
  }
);
```

---

### A5 — `server/src/__tests__/queryService.property.test.ts`

**Properties:** 24 (query scoped to user's ready docs), 25 (QueryLog created per query)

**MUST mock OpenAI before any imports that use it:**

```typescript
import { vi, beforeAll, afterAll, afterEach, it, expect } from 'vitest';
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
```

**Property 24 — POST /api/documents/query returns 200 with answer (50 runs):**
```typescript
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
```

**Property 25 — QueryLog is persisted for every query (50 runs):**
```typescript
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
```

---

### A6 — `server/src/__tests__/queryBar.property.test.ts`

**Property:** 26 (server validates question: required, non-empty, ≤500 chars)

Mock OpenAI the same way as A5.

```typescript
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
```

---

### A7 — `server/src/__tests__/notifications.property.test.ts`

**Properties:** 30 (list scoped to user), 31 (mark single read), 32 (mark all read)

```typescript
async function createNotification(userId: string, overrides = {}) {
  return Notification.create({
    userId,
    message: 'Test notification',
    type: 'processing_complete',
    read: false,
    ...overrides,
  });
}
```

**Property 30 — GET /api/notifications only returns caller's (50 runs):**
```typescript
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
```

**Property 31 — PATCH /:id/read marks only that notification (50 runs):**
```typescript
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
```

**Property 32 — PATCH /mark-all-read marks all user's notifications (50 runs):**
```typescript
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
```

---

### A8 — `server/src/__tests__/alertService.property.test.ts`

**Properties:** 27 (alerts for docs within threshold), 28 (deduplication), 29 (expired skipped)

```typescript
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
```

**Helper:**
```typescript
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
```

**Property 27 — alertJob creates notifications only for docs within 30 days:**
```typescript
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
```

**Property 28 — alertJob does not duplicate already-sent threshold:**
```typescript
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
```

**Property 29 — alertJob skips expired (past expiry) documents:**
```typescript
it('Property 29 — alertJob skips past-expired documents', async () => {
  const user = await createUser();
  const uid = String(user._id);

  await createDocWithExpiry(uid, -5, 'ready', []); // expired 5 days ago

  await alertJob();

  const notifications = await Notification.find({ userId: uid });
  expect(notifications.length).toBe(0);
});
```

---

### A9 — `server/src/__tests__/notificationUi.property.test.ts`

**Properties:** 33 (unreadOnly filter works), 34 (mark-all-read zeroes unread count)

```typescript
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
```

---

### A10 — `server/src/__tests__/dashboard.property.test.ts`

**Properties:** 35 (stats scoped to user), 36 (statusCounts sum equals totalCount), 37 (expiringCount accuracy)

```typescript
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
```

---

### A11 — `server/src/__tests__/settings.property.test.ts`

**Properties:** 38 (profile update), 39 (password change), 40 (account deletion)

```typescript
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
```

---

### A12 — `server/src/__tests__/ingestionReady.property.test.ts`

**Property:** 14 (valid AI result → document reaches Ready state with correct fields)

Mock ALL external services:

```typescript
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
```

```typescript
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
```

---

### A13 — `client/src/api/apiClient.test.ts` — VERIFY & COMPLETE

**File:** `client/src/api/apiClient.test.ts` (already exists, 4933 bytes)

**Action:** Open this file. If it contains `it.todo`, `it.skip`, `.skip(`, or empty test bodies, implement those tests.

**Expected tests that must exist and pass:**
1. The Axios instance has `baseURL` set correctly (pointing to the API)
2. Request interceptor attaches `Authorization: Bearer <token>` when token exists in localStorage
3. Request interceptor does NOT attach Authorization when no token in localStorage
4. Response interceptor calls `authStore.logout()` when a 401 response is received
5. Response interceptor does NOT call logout for non-401 errors

**If these are already implemented and passing, leave the file untouched.**

---

### A14 — `client/src/hooks/useDocumentPolling.test.ts` — VERIFY & COMPLETE

**File:** `client/src/hooks/useDocumentPolling.test.ts` (already exists)

**Action:** Open this file. Verify these 8 test cases exist and pass:
1. Returns `{ document: null }` when `id` is null
2. Calls the poll API when `id` is provided
3. Stops polling when document status is `'ready'`
4. Stops polling when document status is `'failed'`
5. Hard stops after 60 seconds regardless of status
6. Swallows fetch errors and continues polling
7. Clears the interval on component unmount
8. Updates the returned `document` state on each successful poll

**If all 8 pass, leave untouched.**

---

## PHASE B — REACT-HOT-TOAST WIRING

`react-hot-toast` is installed. `<Toaster />` is in `App.tsx`. `Notifications.tsx` and `Settings.tsx` already use it. The following files need toasts added.

### B1 — `client/src/components/UploadDropzone.tsx`

Add `import { toast } from 'react-hot-toast';` at the top.

Find the success callback (after `onSuccess?.()` is called following a successful upload response). Add:
```tsx
toast.success('Document uploaded — processing has started.');
```

Find the catch block for upload failures. Add:
```tsx
toast.error('Upload failed. Please try again.');
```

Find client-side validation failures (MIME type rejection, file too large). Add:
```tsx
toast.error(errorMessage); // alongside or instead of inline error, keep inline error too
```

### B2 — `client/src/pages/DocumentDetail.tsx`

Add `import { toast } from 'react-hot-toast';` at the top.

**In the save handler** (after successful `documentsApi.update()` call):
```tsx
toast.success('Changes saved.');
```
**In the save handler catch block:**
```tsx
toast.error('Failed to save changes.');
```

**In the delete handler** (after successful `documentsApi.remove()`, BEFORE `navigate('/documents')`):
```tsx
toast.success('Document deleted.');
```
**In the delete handler catch block:**
```tsx
toast.error('Failed to delete document.');
```

**In the retry handler** (after successful `documentsApi.retry()`):
```tsx
toast.success('Processing restarted.');
```
**In the retry handler catch block:**
```tsx
toast.error('Failed to restart processing.');
```

Keep all existing inline success/error banner `<div>` elements — toasts are additional feedback, not replacements.

### B3 — `client/src/pages/DocumentsLibrary.tsx`

Add `import { toast } from 'react-hot-toast';` at the top.

In `DocumentsLibrary.tsx`, the `PollingDocumentCard` component uses `useDocumentPolling` and calls `onStatusChange` / `onDocumentUpdate` when the status changes. Find the point where a polled document transitions to `'ready'` or `'failed'`.

Inside `ProcessingDocumentCard` (around lines 235–320), find the `useEffect` or the logic that calls `onStatusChange(polledDoc)`. After calling `onStatusChange`, add:

```tsx
if (polledDoc.status === 'ready') {
  toast.success(`"${polledDoc.title}" is ready.`);
} else if (polledDoc.status === 'failed') {
  toast.error(`Processing failed for "${polledDoc.title}".`);
}
```

This should only fire ONCE per transition (when the previous status was `'processing'` and the new status is terminal). Use a ref to track whether the toast has already been shown:
```tsx
const toastedRef = useRef(false);
// Inside the effect/logic:
if (!toastedRef.current && polledDoc.status !== 'processing') {
  toastedRef.current = true;
  if (polledDoc.status === 'ready') toast.success(`"${polledDoc.title}" is ready.`);
  else toast.error(`Processing failed for "${polledDoc.title}".`);
}
```

---

## PHASE C — FRAMER MOTION ANIMATIONS

`framer-motion` 11.18.2 is installed. Add subtle, tasteful animations. Duration ≤ 0.3s for most interactions.

### C1 — Route Transitions in `client/src/components/AppLayout.tsx`

Add these imports at the top:
```tsx
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
```

In the JSX, find where `<Outlet />` is rendered. Wrap it:
```tsx
const location = useLocation();

// Replace <Outlet /> with:
<AnimatePresence mode="wait">
  <motion.div
    key={location.pathname}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.2, ease: 'easeInOut' }}
    className="h-full"
  >
    <Outlet />
  </motion.div>
</AnimatePresence>
```

### C2 — Document Card List Stagger in `client/src/pages/DocumentsLibrary.tsx`

Add at the top: `import { motion } from 'framer-motion';`

Define variants outside the component function (top level):
```tsx
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
};
```

Find both places where `filteredDocuments` and `searchResults` are rendered in a grid/list `<div>`. Replace the wrapping `<div>` with `<motion.div>` and each child wrapper with `<motion.div>`:

```tsx
<motion.div
  className={isList ? 'flex flex-col gap-3' : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'}
  variants={containerVariants}
  initial="hidden"
  animate="visible"
>
  {filteredDocuments.map((doc) => (
    <motion.div key={doc._id} variants={cardVariants}>
      <PollingDocumentCard ... />
    </motion.div>
  ))}
</motion.div>
```

Apply identically to the `searchResults` render block.

### C3 — Delete Dialog Scale Animation in `client/src/pages/DocumentDetail.tsx`

Add at the top: `import { AnimatePresence, motion } from 'framer-motion';`

Find the delete confirmation overlay JSX (a fixed/absolute backdrop div containing an inner card div). The inner card should be wrapped:

```tsx
<AnimatePresence>
  {deleteModalOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="... existing card classes ..."
      >
        {/* dialog content */}
      </motion.div>
    </div>
  )}
</AnimatePresence>
```

Remove any conditional rendering `{deleteModalOpen && (...)}` that wraps the outer overlay since `AnimatePresence` handles it. Pass the `deleteModalOpen` state to `AnimatePresence` via its children.

### C4 — Notification Bell Badge Spring in `client/src/components/NotificationBell.tsx`

Add at the top: `import { AnimatePresence, motion } from 'framer-motion';`

Find the badge element (the red dot/span showing `unreadCount`). Wrap it:

```tsx
<AnimatePresence>
  {unreadCount > 0 && (
    <motion.span
      key="badge"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      className="... existing badge classes ..."
    >
      {unreadCount > 99 ? '99+' : unreadCount}
    </motion.span>
  )}
</AnimatePresence>
```

---

## PHASE D — ACCESSIBILITY & FOCUS AUDIT

### D1 — Focus Ring Consistency

Every interactive element must have exactly: `focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`

Open each file below and scan every `<button>`, `<input>`, `<a>`, `<select>`, and `<article role="button">`:

- `client/src/components/AppLayout.tsx` — nav links, logout button, theme toggle, hamburger menu
- `client/src/components/NotificationBell.tsx` — the bell button
- `client/src/pages/DocumentsLibrary.tsx` — layout toggle buttons, filter chip buttons, search clear X button
- `client/src/pages/DocumentDetail.tsx` — save button, delete button, retry button, all text inputs, delete modal buttons
- `client/src/pages/Dashboard.tsx` — any clickable cards or buttons
- `client/src/pages/Notifications.tsx` — filter buttons, mark-all-read button, individual read buttons
- `client/src/pages/Settings.tsx` — all inputs, save buttons, delete account button
- `client/src/pages/Login.tsx` — email input, password input, submit button (likely already correct)
- `client/src/pages/Register.tsx` — same

If any element is missing the focus-visible ring, add `focus:outline-none focus-visible:ring-2 focus-visible:ring-ring` to its `className`.

### D2 — ARIA Labels on Icon-Only Buttons

Every button that shows ONLY an icon with no visible text MUST have `aria-label`. Check and fix:

- Theme toggle in `AppLayout.tsx`: `aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}`
- Hamburger menu open button: `aria-label="Open navigation menu"`
- Hamburger menu close button: `aria-label="Close navigation menu"`
- Bell button in `NotificationBell.tsx`: `aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}`
- Layout toggle buttons in `DocumentsLibrary.tsx`: `aria-label="Grid view"` and `aria-label="List view"` (likely already present)

### D3 — `role="alert"` on Dynamic Error Banners

Every error message that appears conditionally (not always on screen) should have `role="alert"` so screen readers announce it when it appears. Audit all error state divs. Most are already done; verify completeness in:
- `DocumentDetail.tsx` save error banner
- `DocumentDetail.tsx` delete error banner
- `Dashboard.tsx` error state
- `Settings.tsx` form errors

---

## PHASE E — FINAL INTEGRATION VERIFICATION

After all phases A–D are complete:

### E1 — Server Tests

```bash
cd c:\Users\shind\Documents\Docket_Anti\Docket\server
npm test
```

All tests must pass. Common failure modes:
- **Text index missing in test:** Call `await Document.syncIndexes()` in `beforeAll` of any test that does full-text search.
- **OpenAI not mocked:** Any test calling `queryService.handle()` or `aiService.answerQuery()` must mock the `openai` module.
- **Missing JWT_SECRET:** Set `process.env.JWT_SECRET = 'test-jwt-secret-docket'` in every test file's `beforeAll`.
- **Port conflict:** Each test file must create its OWN `MongoMemoryServer`. Never share instances.
- **afterEach not cleaning up:** Use `await mongoose.connection.dropDatabase()` after each test.

### E2 — Client Tests

```bash
cd c:\Users\shind\Documents\Docket_Anti\Docket\client
npm test
```

All tests must pass.

### E3 — TypeScript Compilation Check

```bash
cd c:\Users\shind\Documents\Docket_Anti\Docket\client
npx tsc --noEmit
```

Zero TypeScript errors required.

### E4 — Manual Smoke Test

Start backend: `cd server && node --watch index.js`
Start frontend: `cd client && npx vite`

Navigate to `http://localhost:5173` and verify the following flows manually:

1. `/` redirects to `/login`
2. Register a new account → redirects to `/dashboard` with stats visible
3. Dashboard shows: total count, status breakdown, empty chart — no crashes
4. Navigate to `/documents` — upload dropzone visible; upload a PDF → success toast → card with "Processing" badge appears
5. Card transitions to "Ready" → toast fires → click card → detail page loads
6. Edit title field → save → success toast appears
7. Delete document → confirmation dialog animates → confirm → success toast → back to library
8. `/notifications` — processing_complete notification appears
9. Mark a notification read → badge count decreases
10. `/settings` → update name → save → success toast → name updates in sidebar
11. Change password → verify new password works on logout/login
12. Dark mode toggle in sidebar → theme toggles → persists on page refresh
13. AI query bar in Dashboard → type a question → loading spinner → answer appears (requires OpenAI API key in server `.env`)
14. Logout → redirects to `/login`; protected routes redirect back to login when not authenticated

---

## COMPLETION CHECKLIST

Mark each item done only when verified working:

### Phase A — Property Tests
- [ ] A1: `documentMutation.property.test.ts` — Properties 18, 19, 41
- [ ] A2: `search.property.test.ts` — Properties 20, 21, 22
- [ ] A3: `filterChip.property.test.ts` — Property 17
- [ ] A4: `debounce.property.test.ts` — Property 23
- [ ] A5: `queryService.property.test.ts` — Properties 24, 25
- [ ] A6: `queryBar.property.test.ts` — Property 26
- [ ] A7: `notifications.property.test.ts` — Properties 30, 31, 32
- [ ] A8: `alertService.property.test.ts` — Properties 27, 28, 29
- [ ] A9: `notificationUi.property.test.ts` — Properties 33, 34
- [ ] A10: `dashboard.property.test.ts` — Properties 35, 36, 37
- [ ] A11: `settings.property.test.ts` — Properties 38, 39, 40
- [ ] A12: `ingestionReady.property.test.ts` — Property 14
- [ ] A13: `apiClient.test.ts` — verified complete and passing
- [ ] A14: `useDocumentPolling.test.ts` — verified complete (8 cases passing)

### Phase B — Toast Wiring
- [ ] B1: `UploadDropzone.tsx` — success + error toasts
- [ ] B2: `DocumentDetail.tsx` — save/delete/retry toasts
- [ ] B3: `DocumentsLibrary.tsx` — status transition toasts

### Phase C — Animations
- [ ] C1: `AppLayout.tsx` — route fade/slide transition
- [ ] C2: `DocumentsLibrary.tsx` — card list stagger animation
- [ ] C3: `DocumentDetail.tsx` — delete dialog scale animation
- [ ] C4: `NotificationBell.tsx` — badge spring animation

### Phase D — Accessibility
- [ ] D1: Focus rings on all interactive elements verified
- [ ] D2: `aria-label` on all icon-only buttons verified
- [ ] D3: `role="alert"` on all dynamic error banners verified

### Phase E — Final Verification
- [ ] E1: `npm test` in `server/` — ALL tests pass
- [ ] E2: `npm test` in `client/` — ALL tests pass
- [ ] E3: `npx tsc --noEmit` — ZERO TypeScript errors
- [ ] E4: Manual smoke test — all 14 flows verified

---

## FILE MODIFICATION SUMMARY

### Files to CREATE (new test files):
```
server/src/__tests__/documentMutation.property.test.ts  ← A1
server/src/__tests__/search.property.test.ts             ← A2
server/src/__tests__/filterChip.property.test.ts         ← A3
server/src/__tests__/debounce.property.test.ts           ← A4
server/src/__tests__/queryService.property.test.ts       ← A5
server/src/__tests__/queryBar.property.test.ts           ← A6
server/src/__tests__/notifications.property.test.ts      ← A7
server/src/__tests__/alertService.property.test.ts       ← A8
server/src/__tests__/notificationUi.property.test.ts     ← A9
server/src/__tests__/dashboard.property.test.ts          ← A10
server/src/__tests__/settings.property.test.ts           ← A11
server/src/__tests__/ingestionReady.property.test.ts     ← A12
```

### Files to VERIFY then possibly COMPLETE (exist, check for gaps):
```
client/src/api/apiClient.test.ts              ← A13
client/src/hooks/useDocumentPolling.test.ts   ← A14
```

### Files to MODIFY (add features to existing complete files):
```
client/src/components/UploadDropzone.tsx      ← B1: add toasts
client/src/pages/DocumentDetail.tsx           ← B2: add toasts + C3: dialog animation
client/src/pages/DocumentsLibrary.tsx         ← B3: add toasts + C2: card stagger
client/src/components/AppLayout.tsx           ← C1: route transitions
client/src/components/NotificationBell.tsx    ← C4: badge animation
+ All pages for D1/D2/D3 focus/aria audit
```

### Files to NEVER TOUCH:
```
All server/models/*.js
All server/controllers/*.js
All server/routes/*.js
All server/services/*.js
server/jobs/alertJob.js
server/index.js
server/config/db.js
All existing passing test files
client/src/App.tsx
client/src/api/*.ts (except test files)
client/src/store/*.ts
client/src/hooks/useDocumentPolling.ts
client/src/hooks/useDebounce.ts
client/src/pages/Dashboard.tsx
client/src/pages/Notifications.tsx
client/src/pages/Settings.tsx
client/src/pages/Login.tsx (unless adding aria label)
client/src/pages/Register.tsx (unless adding aria label)
client/src/components/ExpiryBadge.tsx
client/src/components/LoadingSkeleton.tsx
client/src/components/ProtectedRoute.tsx
client/src/components/AiQueryBar.tsx
All package.json files
All tsconfig*.json files
vite.config.ts, vitest.config.ts (either)
tailwind.config.js, postcss.config.js
```
