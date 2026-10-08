# Implementation Plan: Docket — AI-Powered Document Intelligence Vault

## Overview

The implementation follows a 12-phase build order. Each phase is self-contained and ends with a verification checkpoint before the next phase begins. Property-based tests use `fast-check` + `@fast-check/vitest`; all tests run with Vitest. The frontend is React 18 + Vite + Tailwind + shadcn/ui; the backend is Node.js/Express + Mongoose + MongoDB Atlas.

---

## Tasks

---

### Phase 1 — Scaffolding

- [x] 1. Initialize monorepo structure and install all root dependencies
  - Create `client/` (Vite + React 18 + TypeScript) and `server/` directories
  - Configure `client/`: Tailwind CSS v3, shadcn/ui init, Framer Motion, Axios, Zustand, react-dropzone, react-hot-toast, Recharts
  - Configure `server/`: Express, Mongoose, dotenv, cors, helmet, morgan, bcryptjs, jsonwebtoken, multer, express-validator
  - Add `vitest.config.ts` (environment `node`, globals, v8 coverage) to both `client/` and `server/`
  - Add `@fast-check/vitest` and `mongodb-memory-server` as dev dependencies
  - _Requirements: all_

- [x] 2. Implement Express server entry point and MongoDB connection
  - [x] 2.1 Create `server/index.js` with Express app, CORS, helmet, morgan, body-parser, and `/api/health` route returning `{ status: 'ok' }`
    - Export the Express `app` separately from the `listen()` call to allow supertest imports
    - _Requirements: all_
  - [x] 2.2 Create `server/config/db.js` — mongoose connect with retry logic; log connection URI (mask credentials); export `connectDB`
    - _Requirements: all_

- [x] 3. Phase 1 checkpoint — verify scaffolding
  - Run `npm run dev` (server) and confirm `/api/health` returns `{ status: 'ok' }`
  - Run `vitest --run` and confirm zero failing tests
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 2 — Authentication

- [x] 4. Implement User Mongoose model
  - [x] 4.1 Create `server/models/User.js` — schema with `name` (String, required, maxlength 100), `email` (String, required, unique, lowercase, trim), `passwordHash` (String, required), `createdAt` (Date, default now)
    - Add `pre('save')` hook that normalises `email` to lowercase before every save
    - _Requirements: 1.4, 1.5_
  - [x]* 4.2 Write property test for User email normalisation
    - **Property 2: Email is always stored in lowercase**
    - **Validates: Requirements 1.5**
    - Tag: `// Feature: docket, Property 2`; use `fc.emailAddress()` with `.toUpperCase()` applied; assert `user.email === email.toLowerCase()`; `numRuns: 100`

- [x] 5. Implement auth controllers and routes
  - [x] 5.1 Create `server/controllers/authController.js` — `register`, `login`, `getMe`
    - `register`: validate name/email/password (express-validator), hash password with bcryptjs cost 12, save User, sign JWT `expiresIn: '7d'`; return 409 on duplicate email, 400 on validation error
    - `login`: find user by lowercased email, bcrypt compare; return generic 401 on any mismatch
    - `getMe`: return `{ name, email }` from `req.userId`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3_
  - [x] 5.2 Create `server/middleware/authMiddleware.js`
    - Verify Bearer JWT from `Authorization` header; attach `req.userId`; return 401 without calling `next()` on any failure
    - _Requirements: 2.4, 15.4_
  - [x] 5.3 Create `server/routes/auth.js` — mount `POST /register`, `POST /login`, `GET /me` (protected)
    - _Requirements: 1.1, 2.1, 2.3_
  - [x]* 5.4 Write property tests for auth service (Properties 1, 3, 4, 5, 6, 7)
    - **Property 1: Registration stores a hash, never the plaintext password** — `fc.string({ minLength: 1, maxLength: 100 })`, `fc.emailAddress()`, `fc.string({ minLength: 8 })`; assert `passwordHash !== password` and `passwordHash.startsWith('$2b$')`; `numRuns: 100`
    - **Property 3: Duplicate email registration is rejected** — register once, attempt again with case variants; assert HTTP 409 and no new User created; `numRuns: 100`
    - **Property 4: Invalid registration inputs return HTTP 400** — `fc.oneof(emptyName, badEmail, shortPassword)`; assert HTTP 400 and no User created; `numRuns: 100`
    - **Property 5: Auth round-trip (register → login → /me) returns consistent user data** — valid credentials; assert JWT expiry ≈ 7 days from now and `/me` returns matching `name`/`email`; `numRuns: 100`
    - **Property 6: Invalid login returns generic HTTP 401** — unregistered email or wrong password; assert HTTP 401 with single generic message; `numRuns: 100`
    - **Property 7: Auth middleware rejects all invalid JWTs** — malformed/expired/missing token; assert HTTP 401 and no handler executed; `numRuns: 500`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.4, 15.4**
    - Tag each test: `// Feature: docket, Property N`

- [x] 6. Implement frontend auth layer
  - [x] 6.1 Create `client/src/store/authStore.ts` — Zustand store with `token`, `user`, `isAuthenticated`, `login()`, `logout()`
    - On init: read token from `localStorage`; if present but expired (check JWT `exp`), call `logout()` immediately
    - _Requirements: 3.1, 3.7_
  - [x] 6.2 Create `client/src/api/apiClient.ts` — single Axios instance; request interceptor attaches `Authorization: Bearer <token>` from `authStore`; response interceptor calls `authStore.logout()` on HTTP 401
    - _Requirements: 3.4, 3.5_
  - [x] 6.3 Create `client/src/api/authApi.ts` — `register`, `login`, `me` functions using `apiClient`
    - _Requirements: 3.2_
  - [x] 6.4 Create `client/src/components/ProtectedRoute.tsx` — reads `isAuthenticated`; redirects to `/login` if false
    - _Requirements: 3.3_
  - [x] 6.5 Create `client/src/pages/Login.tsx` and `client/src/pages/Register.tsx` with form validation, error display, auth store update, and redirect to `/dashboard` on success
    - _Requirements: 3.2_
  - [x] 6.6 Wire React Router in `client/src/App.tsx` — public routes (`/login`, `/register`), protected routes (`/dashboard`, `/documents`, `/documents/:id`, `/notifications`, `/settings`) wrapped with `ProtectedRoute`
    - _Requirements: 3.3_
  - [x]* 6.7 Write property tests for client auth behavior (Properties 8, 9)
    - **Property 8: Client attaches Bearer token to every outbound authenticated request** — set auth store token to arbitrary string; make any API call; assert interceptor added `Authorization: Bearer <token>` header; `numRuns: 100`
    - **Property 9: Unauthenticated routes redirect to /login** — render each protected route with no JWT; assert redirect to `//login` without rendering protected content; `numRuns: 100`
    - **Validates: Requirements 3.3, 3.4**

- [x] 7. Phase 2 checkpoint — verify authentication
  - Ensure all auth property tests pass (`vitest --run`)
  - Verify register → login → `/me` integration test flow passes
  - Confirm `ProtectedRoute` redirects work with no token and expired token
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 3 — Document Upload (No AI)

- [x] 8. Implement Document Mongoose model and Cloudinary service
  - [x] 8.1 Create `server/models/Document.js` — full schema as specified in design: `userId`, `title`, `originalFilename`, `fileUrl`, `fileType`, `extractedText`, `documentType`, `issuer`, `issueDate`, `expiryDate`, `amount`, `tags`, `status`, `failureReason`, `alertsSent`, `reviewedByUser`, `createdAt`, `updatedAt`
    - Add compound index `{ userId: 1, expiryDate: 1 }` and text index `{ title: 'text', extractedText: 'text', issuer: 'text' }`
    - Add `pre('save')` hook to set `updatedAt = Date.now()`
    - _Requirements: 4.4, 9.1_
  - [x] 8.2 Create `server/services/cloudinaryService.js` — `uploadStream(buffer, options)` and `deleteFile(publicId)`
    - Wrap Cloudinary v2 upload_stream in a Promise; propagate errors
    - _Requirements: 4.1, 8.7_

- [x] 9. Implement document upload endpoint
  - [x] 9.1 Create `server/middleware/uploadMiddleware.js` — Multer memory storage; file size limit 15 MB (return 413 on exceed); MIME whitelist `['application/pdf','image/jpeg','image/png','image/webp']` (return 415 with rejected MIME in message on violation)
    - _Requirements: 4.2, 4.3_
  - [x] 9.2 Create `server/controllers/documentsController.js` — `upload` action: run uploadMiddleware, stream buffer to Cloudinary, insert Document `{ status: 'processing', userId: req.userId }`, return HTTP 202 `{ documentId, status }`; on Cloudinary failure return 500 without creating Document
    - _Requirements: 4.4, 4.5, 4.6_
  - [x] 9.3 Create `server/routes/documents.js` — mount `POST /` (authMiddleware + upload), `GET /` (list, stub for now)
    - _Requirements: 4.1_
  - [x]* 9.4 Write property tests for upload validation (Properties 10, 11)
    - **Property 10: Unsupported MIME types are rejected with HTTP 415** — `fc.string()` filtered to values outside the four allowed MIME types; assert HTTP 415 and error message contains the MIME type string; no Document created; `numRuns: 100`
    - **Property 11: Valid upload creates a Document in Processing State scoped to the authenticated user** — valid MIME + size ≤ 15 MB; assert HTTP 202, `status: 'processing'`, `userId` matches JWT; `numRuns: 100`
    - **Validates: Requirements 4.3, 4.4**

- [x] 10. Implement basic document list endpoint
  - [x] 10.1 Add `list` action to `server/controllers/documentsController.js` — `GET /api/documents` returns user's documents sorted by `createdAt` desc, max 50 per page; filter by `userId: req.userId`
    - _Requirements: 7.1, 15.2_
  - [x]* 10.2 Write property test for document list scoping (Property 16)
    - **Property 16: Document list is scoped to the authenticated user and sorted by creation date descending** — create documents for two different users; assert response contains only requester's documents, sorted `createdAt` desc, max 50; `numRuns: 100`
    - **Validates: Requirements 7.1, 15.2**

- [x] 11. Implement upload UI
  - [x] 11.1 Create `client/src/components/UploadDropzone.tsx` — react-dropzone; client-side validate MIME (PDF, JPEG, PNG, WebP) and size ≤ 15 MB; display inline error if validation fails; show upload progress bar via `onUploadProgress`; dispatch to `documentsApi.upload`
    - _Requirements: 4.7, 4.8_
  - [x] 11.2 Create `client/src/api/documentsApi.ts` — `upload(formData, onUploadProgress)`, `list(params)`, stubs for remaining methods
    - _Requirements: 4.8_
  - [x] 11.3 Create `client/src/pages/DocumentsLibrary.tsx` (basic version) — render `UploadDropzone`, call `documentsApi.list`, render document cards in grid, show `LoadingSkeleton` while loading, show error banner with retry on failure
    - _Requirements: 7.2, 7.5, 7.7_
  - [x] 11.4 Create `client/src/components/LoadingSkeleton.tsx` — shape-matched skeleton for document cards and notification items
    - _Requirements: 7.5, 16.1_

- [x] 12. Phase 3 checkpoint — verify document upload
  - Confirm upload → 202 → document appears in list with `status: 'processing'`
  - Verify 413 for oversized files and 415 for unsupported MIME in both unit tests and manual smoke test
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 4 — Text Extraction

- [x] 13. Implement PDF and image text extraction services
  - [x] 13.1 Create `server/services/pdfService.js` — `extractText(fileBuffer)` using `pdf-parse`; return extracted string; return `''` if no text layer or parse error (caller handles empty string as failure per Req 5.5)
    - _Requirements: 5.1_
  - [x] 13.2 Create stub of `server/services/aiService.js` — export `extractTextFromImage(fileUrl)` (calls OpenAI vision API), `extractDocumentData(text)` (stub returning null for now), `answerQuery(metadata, question)` (stub)
    - _Requirements: 5.2_
  - [x]* 13.3 Write property test for PDF text extraction (Property 12)
    - **Property 12: PDF extraction returns a non-empty string for text-bearing PDFs** — generate synthetic text-bearing PDF buffers; assert `pdfService.extractText(buffer)` returns non-empty string; `numRuns: 100`
    - **Validates: Requirements 5.1, 5.5**

- [x] 14. Implement IngestionPipeline — text extraction stage
  - [x] 14.1 Create `server/services/ingestionPipeline.js` — `run(document)` async function: detect `fileType`; call `pdfService.extractText` for PDFs or `aiService.extractTextFromImage` for images; on exception → set `status: 'failed'`, `failureReason` = `"<step>: <cause>"`, create `processing_failed` Notification, return; on empty string → same with reason `"No extractable text found in document"`, create `processing_failed` Notification, return; otherwise save `extractedText` to Document
    - _Requirements: 5.1, 5.2, 5.4, 5.5_
  - [x] 14.2 Wire `ingestionPipeline.run(document)` into `documentsController.upload` as a fire-and-forget call after the 202 response is sent
    - _Requirements: 4.4, 5.1_
  - [x]* 14.3 Write property test for extraction failure handling (Property 13)
    - **Property 13: Extraction failure produces a descriptive failureReason and a processing_failed Notification** — inject simulated extraction errors via mock; assert Document transitions to `status: 'failed'` with non-empty `failureReason` identifying the step, and a `processing_failed` Notification is created; `numRuns: 100`
    - **Validates: Requirements 5.4**

- [x] 15. Phase 4 checkpoint — verify text extraction
  - Upload a text-bearing PDF and confirm `extractedText` is saved to the Document record
  - Upload an image and confirm vision API is called and `extractedText` is saved
  - Confirm failed extraction sets `status: 'failed'` and creates Notification
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 5 — AI Classification and Field Extraction

- [x] 16. Implement `aiService.extractDocumentData`
  - [x] 16.1 Implement `extractDocumentData(extractedText)` in `server/services/aiService.js`
    - Construct structured system prompt + user prompt; use `response_format: { type: 'json_object' }`
    - Parse and validate JSON response against `ExtractionResult` schema: `documentType` must be in enum `['id','certificate','contract','invoice','insurance','warranty','other']`; `suggestedTitle` must be non-empty string; dates must be YYYY-MM-DD or null; amount must be number or null; issuer must be string or null
    - Return validated `ExtractionResult`; throw on schema failure
    - _Requirements: 6.1, 6.5_
  - [x]* 16.2 Write property test for AI response schema validation (Property 15)
    - **Property 15: documentType values outside the allowed enum are treated as schema failures** — `fc.string()` filtered to values not in the seven-element enum; assert `extractDocumentData` throws / returns schema failure; `numRuns: 100`
    - **Validates: Requirements 6.5**

- [x] 17. Implement IngestionPipeline — AI extraction stage with retry
  - [x] 17.1 Extend `ingestionPipeline.run` to call `aiService.extractDocumentData` after successful text extraction
    - On valid response: update Document fields (`documentType`, `issuer`, `issueDate`, `expiryDate`, `amount`, `title = suggestedTitle`), set `status: 'ready'`, create `processing_complete` Notification
    - On schema failure (attempt 1): retry once with the same `extractedText`
    - On schema failure (attempt 2): set `status: 'failed'`, `failureReason: 'AI extraction returned invalid data after retry'`, create `processing_failed` Notification
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [ ]* 17.2 Write property tests for ingestion pipeline AI stage (Properties 14, 15)
    - **Property 14: Valid AI extraction result transitions to Ready State** — inject mock `aiService` returning valid `ExtractionResult` objects (generated by `fc.record`); assert Document `status: 'ready'` and all fields updated; `processing_complete` Notification created; `numRuns: 100`
    - **Property 15 (retry path): Invalid AI response after both attempts transitions to Failed State** — inject mock returning invalid `documentType` on both calls; assert `status: 'failed'`, `failureReason` contains expected message, `processing_failed` Notification created; `numRuns: 100`
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**

- [x] 18. Implement client-side status polling
  - [x] 18.1 Create `client/src/hooks/useDocumentPolling.ts` — polls `documentsApi.get(id)` every 3 seconds, stops after 60 s or when status is `ready` / `failed`
    - _Requirements: 5.3_
  - [x] 18.2 Add processing indicator to document cards in `DocumentsLibrary` and detail page; wire `useDocumentPolling` to update UI within 1 s of status change
    - _Requirements: 5.3, 6.6, 7.6_

- [x] 19. Phase 5 checkpoint — verify end-to-end ingestion
  - Upload a PDF; confirm polling transitions card from Processing → Ready; confirm all AI fields populated
  - Upload a document that will fail extraction; confirm Failed State UI with `failureReason` displayed
  - Run full ingestion integration test (AI and Cloudinary mocked)
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 6 — Documents Library Frontend Polish

- [x] 20. Implement document detail page backend endpoints
  - [x] 20.1 Add `get`, `update`, and `remove` actions to `server/controllers/documentsController.js`
    - `GET /api/documents/:id`: return Document only if `userId` matches; else 404
    - `PATCH /api/documents/:id`: strip immutable fields (`userId`, `status`, `createdAt`, `failureReason`, `originalFilename`, `fileUrl`, `fileType`, `extractedText`, `alertsSent`, `reviewedByUser` — except `reviewedByUser` accepted via dedicated flag); update only provided updatable fields; return full updated Document
    - `DELETE /api/documents/:id`: ownership check → delete Document from DB + Cloudinary file → return 204; else 404
    - _Requirements: 8.1, 8.3, 8.4, 8.7_
  - [x] 20.2 Add `retry` action — `POST /api/documents/:id/retry`: ownership check; reset `status: 'processing'`, clear `failureReason`; fire-and-forget `ingestionPipeline.run`; return 202; else 404
    - _Requirements: 8.9_
  - [x] 20.3 Mount remaining document routes: `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/retry`
    - _Requirements: 8.1, 8.3, 8.7, 8.9_
  - [ ]* 20.4 Write property tests for PATCH immutability and DELETE/retry ownership (Properties 18, 19)
    - **Property 18: PATCH updates only specified updatable fields; protected fields are immutable** — `fc.record` over subsets of updatable fields; assert only supplied fields changed, protected fields identical; `numRuns: 500`
    - **Property 19: DELETE removes document only for owner; retry resets status** — owner vs non-owner user pairs; assert 204 for owner, 404 for non-owner; retry by owner sets `status: 'processing'`; `numRuns: 100`
    - **Validates: Requirements 8.3, 8.7, 8.9**
  - [ ]* 20.5 Write property test for cross-user access (Property 41)
    - **Property 41: Cross-user resource access returns HTTP 404** — document IDs owned by user A accessed by user B; assert 404 on GET, PATCH, DELETE; assert response body does not contain Document data; `numRuns: 500`
    - **Validates: Requirements 15.3, 8.1, 8.4**

- [x] 21. Build full DocumentsLibrary page
  - [x] 21.1 Extend `client/src/pages/DocumentsLibrary.tsx` — grid/list toggle (persisted in `sessionStorage`); filter chips for each `documentType` and tag; client-side filtering logic; empty-state message with clear-filters action; `ExpiryBadge` on each card
    - _Requirements: 7.2, 7.3, 7.4_
  - [x] 21.2 Create `client/src/components/ExpiryBadge.tsx` — colour-coded pill: red ≤ 7 days, amber ≤ 30 days, green otherwise
    - _Requirements: 7.2_
  - [ ]* 21.3 Write property test for filter chip behavior (Property 17)
    - **Property 17: Active filter chips display only matching documents** — `fc.array(fc.record({ documentType, tags }))` for doc sets; `fc.array` for active filter values; render `DocumentsLibrary` with those props; assert every rendered card matches at least one active filter; `numRuns: 100`
    - **Validates: Requirements 7.3**

- [x] 22. Build DocumentDetail page
  - [x] 22.1 Create `client/src/pages/DocumentDetail.tsx` — split layout: preview panel (iframe/img for PDF/image), editable fields form (`title`, `issuer`, `issueDate`, `expiryDate`, `amount`, `tags`); PATCH on save; show `ExpiryBadge`; delete button with confirmation dialog; retry button + polling for Failed State; one-time review banner (`reviewedByUser: false`) that sends `PATCH { reviewedByUser: true }` on dismiss
    - _Requirements: 8.2, 8.3, 8.5, 8.6, 8.7, 8.8_
  - [x] 22.2 Complete `client/src/api/documentsApi.ts` — implement `get`, `update`, `remove`, `retry`, `query`
    - _Requirements: 8.2, 8.7_

- [x] 23. Phase 6 checkpoint — verify documents library and detail
  - Confirm grid/list toggle persists across navigation within session
  - Confirm filter chips show only matching documents; empty state displays when no match
  - Confirm PATCH saves changes and review banner dismissal sets `reviewedByUser: true`
  - Confirm delete confirmation dialog → DELETE → card removed from library
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 7 — Traditional Full-Text Search

- [x] 24. Implement search endpoint and hook up text index
  - [x] 24.1 Create `server/services/searchService.js` — `search(userId, query, type?, tag?)`: validates query ≥ 2 chars; builds MongoDB `$text` query scoped to `userId`; applies optional `documentType` and `tags` filters; returns matching Documents
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 24.2 Add `GET /api/documents/search` route and `search` controller action using `searchService`
    - _Requirements: 9.2_
  - [ ]* 24.3 Write property tests for search scoping and filtering (Properties 20, 21, 22)
    - **Property 20: Full-text search returns only the authenticated user's matching documents** — multi-user document sets; assert all returned Documents have `userId === req.userId` and contain query term; `numRuns: 100`
    - **Property 21: Type filter restricts search results to specified documentType** — inject `type` param; assert every result has `documentType === type`; `numRuns: 100`
    - **Property 22: Combined type + tag filter returns only documents satisfying both constraints** — inject both filters; assert every result matches type AND contains tag; `numRuns: 100`
    - **Validates: Requirements 9.2, 9.3, 9.4**

- [ ] 25. Implement search UI with debounce
  - [x] 25.1 Create `client/src/hooks/useDebounce.ts` — generic debounce hook with 300 ms default delay
    - _Requirements: 9.7_
  - [ ] 25.2 Add search input and `useDebounce` to `DocumentsLibrary` — when query present show search results; when cleared restore full list with active filters; show "no results" message when search returns empty
    - _Requirements: 9.5, 9.6, 9.7, 9.8_
  - [ ]* 25.3 Write property test for debounce behavior (Property 23)
    - **Property 23: Search debounce fires exactly one request per 300 ms idle window** — simulate keystroke sequences with fake timers (`vi.useFakeTimers`); assert at most one request per idle window; keystroke within 300 ms resets timer; `numRuns: 100`
    - **Validates: Requirements 9.7**

- [ ] 26. Phase 7 checkpoint — verify search
  - Run search integration tests against mongodb-memory-server with `$text` index
  - Confirm type filter, tag filter, and combined filter tests pass
  - Confirm debounce property test passes
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 8 — AI Natural-Language Query

- [ ] 27. Implement `aiService.answerQuery` and QueryService
  - [ ] 27.1 Implement `answerQuery(metadataArray, question)` in `server/services/aiService.js`
    - Build prompt: structured system prompt + JSON metadata array + user question; expect free-text answer with JSON footer `{ matchedDocumentIds: [...] }`
    - Parse answer and `matchedDocumentIds` from response
    - _Requirements: 10.1, 10.4_
  - [ ] 27.2 Create `server/services/queryService.js` — `handle(userId, question)`: fetch all Documents `{ userId, status: 'ready' }` with lightweight fields only; call `aiService.answerQuery`; create `QueryLog`; return `{ answer, matchedDocumentIds }`
    - _Requirements: 10.1, 10.2, 10.5_
  - [x] 27.3 Create `server/models/QueryLog.js` — schema with `userId`, `questionText`, `answerText`, `matchedDocumentIds`, `createdAt`
    - _Requirements: 10.5_
  - [ ] 27.4 Add `POST /api/documents/query` route with authMiddleware; validate `question` field non-empty; delegate to `queryService.handle`
    - _Requirements: 10.1_
  - [ ]* 27.5 Write property tests for QueryService (Properties 24, 25)
    - **Property 24: QueryService passes only the authenticated user's Ready documents to AI prompt** — multi-user document sets with mixed statuses; spy on `aiService.answerQuery`; assert metadata array contains only `userId === req.userId` AND `status === 'ready'` docs; `numRuns: 500`
    - **Property 25: QueryService creates a QueryLog for every answered query** — `fc.string({ minLength: 1 })` for questions; assert QueryLog created with correct `userId`, `questionText`, `answerText`, `matchedDocumentIds`; `numRuns: 100`
    - **Validates: Requirements 10.1, 10.2, 10.5, 15.5**

- [ ] 28. Implement AI query bar UI
  - [ ] 28.1 Create `client/src/components/AiQueryBar.tsx` — textarea max 500 chars; guard empty/whitespace submission (display inline validation message, do not send); loading spinner during request; 30 s timeout via `AbortController`; render answer in visually distinct area; render matched document titles as links; "no documents yet" message when user has no Ready documents
    - _Requirements: 10.6, 10.7, 10.8, 10.9, 10.10_
  - [ ]* 28.2 Write property test for query bar validation (Property 26)
    - **Property 26: Client rejects empty or whitespace-only AI query submissions** — `fc.string()` filtered to whitespace-only and empty; render `AiQueryBar`; assert no request sent and inline validation message visible; `numRuns: 100`
    - **Validates: Requirements 10.8**

- [ ] 29. Phase 8 checkpoint — verify AI query
  - Confirm `queryService` integration test: AI mocked, QueryLog created, only user's Ready docs in prompt
  - Confirm query bar rejects whitespace, shows loading, handles 30 s timeout
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 9 — Expiry Alerts

- [ ] 30. Implement Notification model and notification endpoints
  - [x] 30.1 Create `server/models/Notification.js` — schema with `userId`, `documentId`, `message`, `type`, `read`, `createdAt`
    - _Requirements: 12.1_
  - [ ] 30.2 Create `server/controllers/notificationsController.js` — `list` (sorted `createdAt` desc, optional `unreadOnly` param), `markRead` (ownership check → 404), `markAllRead` (update all user's unread → return count)
    - _Requirements: 12.1, 12.2, 12.3_
  - [ ] 30.3 Create `server/routes/notifications.js` — `GET /`, `PATCH /:id/read`, `PATCH /mark-all-read`; all protected
    - _Requirements: 12.1, 12.2, 12.3_
  - [ ]* 30.4 Write property tests for notification endpoints (Properties 30, 31, 32)
    - **Property 30: Notification list scoped to user, sorted by creation date descending** — multi-user notification sets; assert only requester's notifications returned, sorted `createdAt` desc; `unreadOnly=true` returns only `read: false`; `numRuns: 100`
    - **Property 31: Mark-as-read respects ownership** — notification owned by user A; user B sends PATCH; assert 404 and notification unchanged; `numRuns: 100`
    - **Property 32: mark-all-read sets all unread to read for authenticated user** — N unread for user A, M for user B; mark-all-read as user A; assert A's N updated, B's M untouched; response contains N; `numRuns: 100`
    - **Validates: Requirements 12.1, 12.2, 12.3**

- [ ] 31. Implement AlertService (node-cron job)
  - [ ] 31.1 Create `server/services/emailService.js` — `sendExpiryAlert(to, document, daysLeft)` using nodemailer; template covers 30-day, 7-day, 1-day thresholds
    - _Requirements: 11.3_
  - [ ] 31.2 Create `server/jobs/alertJob.js` — query Documents `{ status: 'ready', expiryDate: { $lte: +30 days } }`; compute `daysLeft`; for each threshold not in `alertsSent`, send email + create `expiry_alert` Notification + push threshold into `alertsSent`; wrap each document in try/catch (log error, continue); export `alertJob` function and `cron.schedule('0 8 * * *', alertJob, { timezone: 'UTC' })` initialiser
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
  - [ ] 31.3 Register `alertJob` cron schedule in `server/index.js`
    - _Requirements: 11.1_
  - [ ]* 31.4 Write property tests for AlertService (Properties 27, 28, 29)
    - **Property 27: AlertService identifies documents with expiryDate within 0–30 calendar days** — `fc.date()` arbitraries for expiryDate; assert documents outside 0–30 day window are excluded; `numRuns: 100`
    - **Property 28: AlertService sends each threshold alert exactly once per document** — run `alertJob` twice; assert each applicable threshold created exactly one Notification and `alertsSent` prevents re-send; `numRuns: 100`
    - **Property 29: AlertService failure on one document does not interrupt the rest** — inject failing mock for one document in batch; assert remaining documents processed and their thresholds sent; `numRuns: 100`
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.5**

- [ ] 32. Implement notification UI
  - [ ] 32.1 Create `client/src/store/notificationStore.ts` — Zustand store `{ unreadCount, setUnreadCount, decrement, reset }`
    - _Requirements: 12.4_
  - [ ] 32.2 Create `client/src/components/NotificationBell.tsx` — reads `notificationStore.unreadCount`; shows badge with count when > 0; hides badge when count is 0; clicking opens dropdown with top 5 unread
    - _Requirements: 12.4_
  - [ ] 32.3 Create `client/src/api/notificationsApi.ts` — `list`, `markRead`, `markAllRead`
    - _Requirements: 12.1, 12.2, 12.3_
  - [ ] 32.4 Create `client/src/pages/Notifications.tsx` — full list; type filter chips; mark-read on click; mark-all-read button; skeleton loading; navigate to document on click if `documentId` present
    - _Requirements: 12.5, 12.6, 12.7_
  - [ ]* 32.5 Write property tests for notification UI (Properties 33, 34)
    - **Property 33: Notification bell badge count matches the unread notification count** — `fc.integer({ min: 0, max: 1000 })`; render `NotificationBell` with count N; assert badge shows N when N > 0 and no badge when N = 0; `numRuns: 100`
    - **Property 34: Notification type filter displays only notifications of the selected type** — `fc.array` of notifications with mixed types; apply type filter; assert every rendered item has matching `type`; `numRuns: 100`
    - **Validates: Requirements 12.4, 12.5**

- [ ] 33. Phase 9 checkpoint — verify alerts and notifications
  - Run AlertService integration test: documents at each threshold, duplicate prevention confirmed, error isolation confirmed
  - Confirm notification bell badge updates after mark-all-read
  - Confirm type filter hides other-type notifications
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 10 — Dashboard

- [ ] 34. Implement dashboard stats endpoint
  - [ ] 34.1 Create `server/controllers/dashboardController.js` — `GET /api/dashboard/stats`: aggregate `totalCount`, per-status counts, `expiringCount` (expiryDate ≤ 30 days, status ready), `unreadNotificationCount`, per-type counts, `recentDocuments` (5 most recently updated); all scoped to `req.userId`
    - _Requirements: 13.1, 13.6_
  - [ ] 34.2 Create `server/routes/dashboard.js` — `GET /stats` with authMiddleware; mount at `/api/dashboard`
    - _Requirements: 13.6_
  - [ ]* 34.3 Write property test for dashboard stats scoping (Property 35)
    - **Property 35: Dashboard stats returns all required fields scoped to the authenticated user** — multi-user data; assert response contains `totalCount`, per-status counts, `expiringCount`, `unreadNotificationCount`, per-type counts, `recentDocuments`; all values derived from requester's data only; `numRuns: 100`
    - **Validates: Requirements 13.6**

- [ ] 35. Build Dashboard page
  - [ ] 35.1 Create `client/src/pages/Dashboard.tsx` — on load fetch `/api/dashboard/stats`; render stat cards (total, per-status, expiring, unread); render Recharts bar/pie chart of per-type counts; render expiring-soon widget (≤ 10 docs sorted by `expiryDate` asc); render recent-activity list (5 docs sorted by `max(createdAt, updatedAt)` desc); embed `AiQueryBar`; error banner with retry on stats fetch failure
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.7_
  - [ ]* 35.2 Write property tests for dashboard widgets (Properties 36, 37)
    - **Property 36: Expiring-soon widget displays at most 10 documents sorted by expiryDate ascending** — `fc.array` of documents with `expiryDate` within 30 days; render widget; assert at most 10 items; assert sorted `expiryDate` asc; `numRuns: 100`
    - **Property 37: Recent-activity list shows exactly 5 most recently created or updated documents** — `fc.array` of documents with varied `createdAt`/`updatedAt`; render list; assert exactly 5 items with latest `max(createdAt, updatedAt)` values, sorted desc; `numRuns: 100`
    - **Validates: Requirements 13.3, 13.4**

- [ ] 36. Phase 10 checkpoint — verify dashboard
  - Confirm stat cards reflect correct user-scoped aggregations
  - Confirm expiring-soon widget sorted correctly and capped at 10
  - Confirm recent-activity list shows exactly 5 items
  - Confirm AI query bar functions from dashboard
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 11 — Final Polish

- [ ] 37. Implement Settings page backend
  - [ ] 37.1 Create `server/controllers/settingsController.js`
    - `PATCH /api/settings/profile`: update `name`/`email` (check duplicate email → 409); return updated user
    - `PATCH /api/settings/password`: compare `currentPassword` with stored hash → 401 if mismatch; validate new password ≥ 8 chars; hash and save new password → 200
    - `DELETE /api/settings/account`: delete User + all their Documents (and Cloudinary files) + Notifications + QueryLogs → 200
    - _Requirements: 14.2, 14.3, 14.6_
  - [ ] 37.2 Create `server/routes/settings.js` — mount profile, password, account routes; all protected
    - _Requirements: 14.1_
  - [ ]* 37.3 Write property tests for settings (Properties 38, 39, 40)
    - **Property 38: Password change verifies current password hash before updating** — `fc.string({ minLength: 8 })` for new passwords; wrong `currentPassword` → 401 and hash unchanged; correct `currentPassword` + valid new password → 200 and hash updated; `numRuns: 100`
    - **Property 39: Account deletion removes all associated data** — user with associated Documents, Notifications, QueryLogs; delete; assert all records removed; other users' data untouched; `numRuns: 100`
    - **Property 40: Server uses only JWT-derived userId; client-supplied userId ignored** — inject `userId` in request body differing from JWT; assert all DB operations use JWT `userId`; `numRuns: 500`
    - **Validates: Requirements 14.3, 14.6, 15.1**

- [ ] 38. Build Settings page frontend
  - [ ] 38.1 Create `client/src/pages/Settings.tsx` — four sections: profile (name/email PATCH), password change (client validates new password ≥ 8 chars before submit), appearance (dark/light toggle), account deletion (confirmation dialog requiring exact email match before enabling delete button)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_
  - [ ] 38.2 Implement dark/light mode toggle — read `localStorage` preference on init; fall back to `prefers-color-scheme`; apply Tailwind `dark` class to `<html>`; persist changes to `localStorage`
    - _Requirements: 14.8, 14.9_

- [ ] 39. Apply animations, responsive layout, and accessibility polish
  - [ ] 39.1 Add Framer Motion: fade transition on route change (≤ 300 ms), stagger fade-in for list items (≤ 50 ms per item), scale-and-fade on modal open/close (≤ 200 ms), slide-in toast from bottom-right, card transition animation on Processing → Ready state change
    - _Requirements: 16.4_
  - [ ] 39.2 Audit and fix responsive layout for viewport widths 375 px – 1920 px; ensure no horizontal overflow on any page
    - _Requirements: 16.5_
  - [ ] 39.3 Apply consistent Inter typeface and accent color to all primary actions, active state indicators, and AI query bar border
    - _Requirements: 16.6_
  - [ ] 39.4 Audit all interactive elements: ensure focus indicators have ≥ 3:1 contrast ratio; add distinct hover states; verify both light and dark modes
    - _Requirements: 16.7_
  - [ ] 39.5 Ensure `react-hot-toast` is wired for all transient results (save success, copy, form errors); configure 4 s auto-dismiss; slide-in from bottom-right
    - _Requirements: 16.8_
  - [ ] 39.6 Verify all loading states use `LoadingSkeleton`; verify all empty states display appropriate message with next-action link; verify all error states show retry button
    - _Requirements: 16.1, 16.2, 16.3_

- [ ] 40. Phase 11 checkpoint — verify polish
  - Run full test suite with `vitest --run`; confirm all 41 property tests pass
  - Manually verify dark mode toggle persists across reload
  - Confirm account deletion clears auth and redirects to `/login`
  - Confirm animations present on route change and modal open/close
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 12 — Deployment

- [ ] 41. Configure environment variables and production builds
  - [ ] 41.1 Create `.env.example` files for both `client/` and `server/` documenting all required environment variables (`MONGODB_URI`, `JWT_SECRET`, `CLOUDINARY_*`, `OPENAI_API_KEY`, `SMTP_*`, `VITE_API_BASE_URL`)
    - Add `.env` to `.gitignore`
    - _Requirements: all_
  - [ ] 41.2 Add `client/vercel.json` — rewrite rule `"source": "/(.*)", "destination": "/index.html"` for SPA routing; set `VITE_API_BASE_URL` env var pointing to production server
    - _Requirements: all_
  - [ ] 41.3 Configure `server/` for Render/Railway deployment — ensure `npm start` runs `node index.js`; set `NODE_ENV=production`; confirm CORS `origin` env var accepts the Vercel client domain
    - _Requirements: all_

- [ ] 42. Final deployment checkpoint
  - Deploy client to Vercel; deploy server to Render/Railway
  - Set all environment variables in both dashboards
  - Smoke-test: register, upload a document, confirm processing completes, run an AI query, confirm expiry alert job is scheduled
  - Confirm MongoDB Atlas full-text index exists on Document collection
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional property/unit tests that can be skipped for a faster MVP build.
- Each phase ends with a checkpoint task — do not proceed to the next phase until the checkpoint passes.
- The design document's Correctness Properties are numbered 1–41; every `*` test task references its property number explicitly and the `// Feature: docket, Property N` comment must appear in test code.
- All property tests use `@fast-check/vitest` with `numRuns: 100` minimum; Properties 7, 18, 24, 40, 41 use `numRuns: 500` due to security sensitivity.
- `mongodb-memory-server` is used for all backend integration tests to avoid touching the real Atlas cluster.
- `aiService.js` and `cloudinaryService.js` are always mocked in integration tests.
- The ingestion pipeline is fire-and-forget after HTTP 202; never await it in the upload request handler.
- All database queries on Document, Notification, and QueryLog MUST include `userId: req.userId` — this is enforced by Property 40 and 41 tests.
- The `reviewedByUser` flag is normally in the PATCH immutable list but is accepted when the client sends it via the review-banner dismiss PATCH — implement this as a dedicated boolean flag that the strip logic explicitly allows through.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2"] },
    { "id": 1, "tasks": ["4.1", "6.1", "6.2", "6.3", "6.4"] },
    { "id": 2, "tasks": ["4.2", "5.1", "5.2", "5.3", "6.5", "6.6"] },
    { "id": 3, "tasks": ["5.4", "6.7", "8.1", "8.2"] },
    { "id": 4, "tasks": ["9.1", "9.2", "9.3", "10.1", "11.1", "11.2", "11.3", "11.4"] },
    { "id": 5, "tasks": ["9.4", "10.2", "13.1", "13.2", "16.1", "16.2"] },
    { "id": 6, "tasks": ["14.1", "14.2", "14.3", "18.1", "18.2", "20.1", "20.2", "20.3", "21.1", "21.2", "22.1", "22.2"] },
    { "id": 7, "tasks": ["13.3", "17.1", "17.2", "20.4", "20.5", "21.3"] },
    { "id": 8, "tasks": ["24.1", "24.2", "25.1", "25.2", "27.3", "30.1", "30.2", "30.3", "31.1", "31.2", "31.3", "32.1", "32.2", "32.3", "32.4", "34.1", "34.2"] },
    { "id": 9, "tasks": ["24.3", "25.3", "27.1", "27.2", "27.4", "30.4", "31.4", "32.5", "34.3", "35.1", "37.1", "37.2"] },
    { "id": 10, "tasks": ["27.5", "28.1", "35.2", "37.3", "38.1", "38.2", "39.1", "39.2", "39.3", "39.4", "39.5", "39.6"] },
    { "id": 11, "tasks": ["28.2", "41.1", "41.2", "41.3"] }
  ]
}
```
