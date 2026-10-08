/**
 * uploadMiddleware — Multer memory-storage middleware for document uploads.
 *
 * - Accepts files up to 15 MB (returns 413 on exceed — Req 4.2)
 * - Whitelists MIME types: application/pdf, image/jpeg, image/png, image/webp
 *   (returns 415 with the rejected MIME type on violation — Req 4.3)
 * - Stores the file buffer in memory so it can be streamed directly to Cloudinary
 */
import multer from 'multer';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  // Use MAX_FILE_SIZE_BYTES + 1 so Busboy's >= comparison allows exactly 15 MB
  // (Busboy fires the 'limit' event when bytes read >= limit, so the limit must
  // be set one byte above the actual maximum to make the boundary inclusive)
  limits: { fileSize: MAX_FILE_SIZE_BYTES + 1 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      // Attach the rejected MIME type so the error handler can surface it
      const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
      err.message = file.mimetype;
      cb(err);
    }
  },
});

/**
 * Express middleware that parses a single file field named "file".
 * Converts Multer errors into the correct HTTP responses:
 *   - LIMIT_FILE_SIZE  → 413
 *   - LIMIT_UNEXPECTED_FILE (used for MIME rejection) → 415
 */
export function uploadMiddleware(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum allowed size is 15 MB.' });
      }

      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        // err.message carries the rejected MIME type (set in fileFilter above)
        return res
          .status(415)
          .json({ error: `Unsupported file type: ${err.message}. Allowed types: application/pdf, image/jpeg, image/png, image/webp.` });
      }
    }

    // Any other error (e.g. unexpected Multer issue)
    return next(err);
  });
}
