/**
 * Documents Controller
 *
 * Requirements: 4.1, 4.4, 4.5, 4.6, 7.1, 9.2, 15.1, 15.2
 */
import { uploadMiddleware } from '../middleware/uploadMiddleware.js';
import * as cloudinaryService from '../services/cloudinaryService.js';
import Document from '../models/Document.js';
import { run as runIngestionPipeline } from '../services/ingestionPipeline.js';
import * as searchService from '../services/searchService.js';
import * as queryService from '../services/queryService.js';

// ---------------------------------------------------------------------------
// Helper — derive fileType from MIME type
// ---------------------------------------------------------------------------

function getFileType(mimetype) {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.startsWith('image/')) return 'image';
  return null; // should never reach here after MIME validation
}

// ---------------------------------------------------------------------------
// POST /api/documents  — upload action (Req 4.4, 4.5, 4.6)
// ---------------------------------------------------------------------------

/**
 * upload — handles multipart document uploads.
 *
 * Flow:
 *  1. Run uploadMiddleware (Multer) — validates MIME type and file size.
 *  2. Stream the in-memory buffer to Cloudinary.
 *     On failure: return HTTP 500, do NOT create a Document record (Req 4.5).
 *  3. Insert Document with status 'processing' scoped to req.userId (Req 4.4).
 *  4. Return HTTP 202 { documentId, status } before any AI processing (Req 4.4).
 */
export function upload(req, res, next) {
  // Step 1 — run upload middleware (MIME + size validation)
  uploadMiddleware(req, res, async (err) => {
    if (err) {
      // uploadMiddleware already sent the response for 413/415; for anything
      // else forward to the global error handler.
      if (!res.headersSent) {
        return next(err);
      }
      return;
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file attached. Please include a file field named "file".' });
    }

    const { buffer, mimetype, originalname } = req.file;
    const fileType = getFileType(mimetype);

    try {
      // Step 2 — stream buffer to Cloudinary
      const { fileUrl, publicId } = await cloudinaryService.uploadStream(buffer, {
        folder: 'docket',
        resource_type: 'auto',
        public_id: `${Date.now()}-${originalname.replace(/\s+/g, '_')}`,
      });

      // Step 3 — insert Document record (status: 'processing')
      const document = await new Document({
        userId: req.userId,          // derived exclusively from verified JWT (Req 15.1)
        title: originalname,         // initial title; AI will update it after extraction
        originalFilename: originalname,
        fileUrl,
        fileType,
        status: 'processing',
      }).save();

      // Step 4 — return HTTP 202 before any AI processing (Req 4.4)
      res.status(202).json({
        documentId: document._id,
        status: document.status,
      });

      // Step 5 — fire-and-forget ingestion pipeline (Req 4.4, 5.1)
      // Response already sent; errors are handled inside the pipeline.
      runIngestionPipeline(document).catch((err) => {
        console.error('ingestionPipeline unhandled error:', err);
      });
    } catch (uploadErr) {
      // Cloudinary failure — return 500 without creating a Document (Req 4.5)
      console.error('Cloudinary upload failed:', uploadErr);
      return res.status(500).json({ error: 'File storage failed. Please try again.' });
    }
  });
}

// ---------------------------------------------------------------------------
// GET /api/documents  — list action (Req 4.1, 7.1, 15.2)
// ---------------------------------------------------------------------------

const LIST_LIMIT = 50;

/**
 * list — returns the authenticated user's documents, newest first.
 *
 * Query params:
 *   page  {number}  — 1-based page number (default 1)
 *
 * Response shape matches PaginatedDocuments in client/src/api/documentsApi.ts:
 *   { documents, total, page, limit }
 *
 * Security (Req 15.2): filter uses req.userId exclusively; any userId in the
 * query string or body is ignored.
 */
export async function list(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const skip = (page - 1) * LIST_LIMIT;

    const filter = { userId: req.userId };

    const [documents, total] = await Promise.all([
      Document.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(LIST_LIMIT),
      Document.countDocuments(filter),
    ]);

    return res.json({ documents, total, page, limit: LIST_LIMIT });
  } catch (err) {
    console.error('documents.list error:', err);
    return res.status(500).json({ error: 'Failed to retrieve documents.' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/documents/search  — search action (Req 9.2)
// ---------------------------------------------------------------------------

/**
 * search — performs a full-text search over the authenticated user's documents.
 *
 * Query params:
 *   q    {string}  — Search query string (minimum 2 characters, required)
 *   type {string}  — Optional documentType filter (Req 9.3)
 *   tag  {string}  — Optional tag filter (Req 9.4)
 *
 * Security (Req 15.1, 15.2): userId is derived exclusively from req.userId
 * (set by authMiddleware from the verified JWT); any userId in query params
 * is ignored.
 */
export async function search(req, res) {
  const { q, type, tag } = req.query;

  try {
    const results = await searchService.search(req.userId, q, type, tag);
    return res.json(results);
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error('documents.search error:', err);
    return res.status(500).json({ error: 'Search failed. Please try again.' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/documents/:id  — get action (Req 8.1, 15.3)
// ---------------------------------------------------------------------------

/**
 * get — returns a single document owned by the authenticated user.
 *
 * Returns 404 (not found) if:
 *  - the document does not exist
 *  - the document belongs to a different user (Req 15.3)
 */
export async function get(req, res) {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc || String(doc.userId) !== String(req.userId)) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    return res.json(doc);
  } catch (err) {
    console.error('documents.get error:', err);
    return res.status(500).json({ error: 'Failed to retrieve document.' });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/documents/:id  — update action (Req 8.3, 8.4)
// ---------------------------------------------------------------------------

/**
 * Fields that must never be mutated by the client.
 * reviewedByUser is intentionally excluded — it may be set to true via PATCH.
 */
const IMMUTABLE_FIELDS = [
  'userId',
  'status',
  'createdAt',
  'failureReason',
  'originalFilename',
  'fileUrl',
  'fileType',
  'extractedText',
  'alertsSent',
];

/**
 * update — applies a partial update to a document owned by the authenticated user.
 *
 * Immutable fields are stripped before the update is applied (Req 8.4).
 * Returns the full updated document (Req 8.3).
 */
export async function update(req, res) {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc || String(doc.userId) !== String(req.userId)) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Strip immutable fields from the incoming payload
    const payload = { ...req.body };
    for (const field of IMMUTABLE_FIELDS) {
      delete payload[field];
    }

    // Apply the sanitised fields to the document and save (triggers pre-save hook
    // which bumps updatedAt)
    Object.assign(doc, payload);
    const updated = await doc.save();

    return res.json(updated);
  } catch (err) {
    console.error('documents.update error:', err);
    return res.status(500).json({ error: 'Failed to update document.' });
  }
}

// ---------------------------------------------------------------------------
// POST /api/documents/:id/retry  — retry action (Req 8.9)
// ---------------------------------------------------------------------------

/**
 * retry — re-queues a failed document for ingestion.
 *
 * Ownership check: returns 404 if the document doesn't exist or belongs to
 * a different user.
 *
 * Resets status to 'processing' and clears failureReason, then fires the
 * ingestion pipeline as a fire-and-forget operation.
 *
 * Returns HTTP 202 { status: 'processing' } (Req 8.9).
 */
export async function retry(req, res) {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc || String(doc.userId) !== String(req.userId)) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Reset processing state
    doc.status = 'processing';
    doc.failureReason = null;
    const updatedDoc = await doc.save();

    // Return 202 before pipeline starts
    res.status(202).json({ status: 'processing' });

    // Fire-and-forget ingestion pipeline
    runIngestionPipeline(updatedDoc).catch((err) => {
      console.error('ingestionPipeline unhandled error (retry):', err);
    });
  } catch (err) {
    console.error('documents.retry error:', err);
    return res.status(500).json({ error: 'Failed to retry document processing.' });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/documents/:id  — remove action (Req 8.7)
// ---------------------------------------------------------------------------

/**
 * Derive a Cloudinary public_id from a secure_url.
 *
 * Cloudinary secure URLs follow the pattern:
 *   https://res.cloudinary.com/<cloud_name>/<resource_type>/upload/<version>/<public_id>.<ext>
 *
 * The public_id is everything between "/upload/v<version>/" and the final
 * extension, which may include folder segments (e.g. "docket/abc123").
 */
function extractPublicId(fileUrl) {
  try {
    const url = new URL(fileUrl);
    // pathname looks like: /<cloud_name>/image/upload/v1234567890/docket/filename.pdf
    const match = url.pathname.match(/\/upload\/(?:v\d+\/)?(.+?)(\.[^.]+)?$/);
    if (match) {
      return match[1]; // e.g. "docket/1234567890-filename_pdf"
    }
  } catch {
    // Malformed URL — fall through and return null
  }
  return null;
}

/**
 * remove — deletes a document record and its corresponding Cloudinary file.
 *
 * Ownership check: returns 404 if the document doesn't exist or belongs to
 * a different user (Req 15.3).
 *
 * Cloudinary deletion failure is non-fatal: the DB record is still deleted
 * and the error is logged (Req 8.7).
 *
 * Returns HTTP 204 No Content on success (Req 8.7).
 */
export async function remove(req, res) {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc || String(doc.userId) !== String(req.userId)) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Delete the DB record first
    await Document.deleteOne({ _id: doc._id });

    // Attempt Cloudinary deletion — extract public_id from the stored fileUrl
    const publicId = extractPublicId(doc.fileUrl);
    if (publicId) {
      cloudinaryService.deleteFile(publicId).catch((err) => {
        console.error('Cloudinary deletion failed for publicId', publicId, ':', err);
      });
    } else {
      console.warn('Could not extract Cloudinary publicId from fileUrl:', doc.fileUrl);
    }

    return res.status(204).send();
  } catch (err) {
    console.error('documents.remove error:', err);
    return res.status(500).json({ error: 'Failed to delete document.' });
  }
}

/**
 * query — handles AI natural-language query over user's documents.
 * Requirements: 10.1, 10.8
 */
export async function query(req, res) {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string' || question.trim() === '') {
      return res.status(400).json({ error: 'Question is required and must be a non-empty string.' });
    }

    if (question.length > 500) {
      return res.status(400).json({ error: 'Question cannot exceed 500 characters.' });
    }

    const result = await queryService.handle(req.userId, question.trim());
    return res.status(200).json(result);
  } catch (err) {
    console.error('documents.query error:', err);
    return res.status(500).json({ error: 'Failed to process AI query.' });
  }
}
