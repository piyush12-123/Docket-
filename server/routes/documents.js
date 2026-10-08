/**
 * Documents routes — mounted at /api/documents in server/index.js
 *
 * POST   /            — upload a document (auth required)
 * GET    /            — list user's documents (auth required)
 * GET    /search      — search user's documents (auth required)
 * GET    /:id         — get a single document (auth required)
 * PATCH  /:id         — update a document (auth required)
 * DELETE /:id         — delete a document (auth required)
 * POST   /:id/retry   — retry failed document ingestion (auth required)
 *
 * Requirements: 4.1, 8.1, 8.3, 8.4, 8.7, 8.9, 9.2
 */
import { Router } from 'express';
import { upload, list, get, update, remove, retry, search, query } from '../controllers/documentsController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// POST /api/documents — upload a document
// authMiddleware verifies the JWT; upload handles the multipart form + Cloudinary
router.post('/', authMiddleware, upload);

// GET /api/documents — list the authenticated user's documents
router.get('/', authMiddleware, list);

// GET /api/documents/search — search the authenticated user's documents (Req 9.2)
// NOTE: must be declared BEFORE /:id to prevent "search" being captured as an id param
router.get('/search', authMiddleware, search);

// POST /api/documents/query — natural-language AI query (Req 10.1)
// NOTE: must be declared BEFORE /:id to prevent "query" being captured as an id param
router.post('/query', authMiddleware, query);

// GET /api/documents/:id — retrieve a single document (Req 8.1, 15.3)
router.get('/:id', authMiddleware, get);

// PATCH /api/documents/:id — partial update of a document (Req 8.3, 8.4)
router.patch('/:id', authMiddleware, update);

// DELETE /api/documents/:id — delete a document (Req 8.7)
router.delete('/:id', authMiddleware, remove);

// POST /api/documents/:id/retry — retry failed document ingestion (Req 8.9)
router.post('/:id/retry', authMiddleware, retry);

export default router;
