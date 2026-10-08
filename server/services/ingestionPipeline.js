/**
 * ingestionPipeline — full async ingestion pipeline.
 *
 * Runs AFTER the HTTP 202 response is sent (fire-and-forget).
 *
 * Pipeline stages:
 *   1. Detect fileType (pdf or image).
 *   2. Extract text via pdfService or aiService.extractTextFromImage.
 *   3. On exception → Failed State + processing_failed Notification.
 *   4. On empty string → Failed State + processing_failed Notification.
 *   5. Save extractedText to Document.
 *   6. Call aiService.extractDocumentData (attempt 1).
 *   7. On schema failure (attempt 1) → retry once with same extractedText.
 *   8. On schema failure (attempt 2) → Failed State + processing_failed Notification.
 *   9. On valid result → update Document fields, set status 'ready',
 *      create processing_complete Notification.
 *
 * Requirements: 5.1, 5.2, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5
 */
import Document from '../models/Document.js';
import Notification from '../models/Notification.js';
import * as pdfService from './pdfService.js';
import * as aiService from './aiService.js';

// ---------------------------------------------------------------------------
// Helper — create a Notification
// ---------------------------------------------------------------------------
async function createNotification({ userId, documentId, message, type }) {
  try {
    await new Notification({ userId, documentId, message, type, read: false }).save();
  } catch (err) {
    // Never let notification creation failure crash the pipeline
    console.error('ingestionPipeline: failed to create notification', err);
  }
}

// ---------------------------------------------------------------------------
// Helper — transition Document to Failed State
// ---------------------------------------------------------------------------
async function failDocument(document, step, cause) {
  const failureReason = `${step}: ${cause}`;

  try {
    await Document.findByIdAndUpdate(document._id, {
      status: 'failed',
      failureReason,
    });
  } catch (err) {
    console.error('ingestionPipeline: failed to update document status to failed', err);
  }

  await createNotification({
    userId: document.userId,
    documentId: document._id,
    message: `Document "${document.originalFilename}" could not be processed. Reason: ${failureReason}`,
    type: 'processing_failed',
  });
}

// ---------------------------------------------------------------------------
// run — entry point called fire-and-forget from documentsController
// ---------------------------------------------------------------------------

/**
 * Run the ingestion pipeline for a newly uploaded document.
 *
 * @param {import('../models/Document.js').default} document - Saved Document instance
 */
export async function run(document) {
  // ─── Step 1: Text extraction ────────────────────────────────────────────

  let extractedText;

  if (document.fileType === 'pdf') {
    // PDF text extraction (Requirement 5.1)
    try {
      // fileUrl is the Cloudinary URL; for PDF extraction we need the buffer.
      // The Document has already been saved — we can't recover the original
      // buffer here. The controller must pass the buffer separately, OR we
      // fetch it from Cloudinary. For now we store the fileUrl on the document
      // and fetch the buffer here.
      //
      // Fetch the PDF bytes from Cloudinary (publicly accessible URL).
      const response = await fetch(document.fileUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching PDF from storage`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      extractedText = await pdfService.extractText(buffer);
    } catch (err) {
      await failDocument(document, 'PDF parsing', err.message ?? String(err));
      return;
    }
  } else {
    // Image — vision API (Requirement 5.2)
    try {
      extractedText = await aiService.extractTextFromImage(document.fileUrl);
    } catch (err) {
      await failDocument(document, 'vision API call', err.message ?? String(err));
      return;
    }
  }

  // ─── Step 2: Empty-text check (Requirement 5.5) ─────────────────────────

  if (!extractedText || extractedText.trim() === '') {
    await failDocument(
      document,
      'text extraction',
      'No extractable text found in document',
    );
    return;
  }

  // ─── Step 3: Save extracted text ────────────────────────────────────────

  try {
    await Document.findByIdAndUpdate(document._id, { extractedText });
  } catch (err) {
    console.error('ingestionPipeline: failed to save extractedText', err);
    await failDocument(document, 'database update', err.message ?? String(err));
    return;
  }

  // ─── Step 4: AI classification and field extraction ────────────────────
  // Requirements: 6.1, 6.2, 6.3, 6.4, 6.5

  let extractionResult = null;

  // Attempt 1
  try {
    extractionResult = await aiService.extractDocumentData(extractedText);
  } catch (err) {
    // Schema failure on attempt 1 — retry once (Requirement 6.3)
    console.warn('ingestionPipeline: AI extraction attempt 1 failed, retrying…', err.message ?? String(err));

    try {
      extractionResult = await aiService.extractDocumentData(extractedText);
    } catch (retryErr) {
      // Schema failure on attempt 2 — transition to Failed State (Requirement 6.4)
      console.error('ingestionPipeline: AI extraction attempt 2 failed', retryErr.message ?? String(retryErr));

      try {
        await Document.findByIdAndUpdate(document._id, {
          status: 'failed',
          failureReason: 'AI extraction returned invalid data after retry',
        });
      } catch (dbErr) {
        console.error('ingestionPipeline: failed to update document status after AI retry failure', dbErr);
      }

      await createNotification({
        userId: document.userId,
        documentId: document._id,
        message: `Document "${document.originalFilename}" could not be processed. Reason: AI extraction returned invalid data after retry`,
        type: 'processing_failed',
      });

      return;
    }
  }

  // ─── Step 5: Save AI extraction results and transition to Ready State ───
  // Requirement 6.2

  const title = extractionResult.suggestedTitle;

  try {
    await Document.findByIdAndUpdate(document._id, {
      documentType: extractionResult.documentType,
      issuer: extractionResult.issuer,
      issueDate: extractionResult.issueDate,
      expiryDate: extractionResult.expiryDate,
      amount: extractionResult.amount,
      title,
      status: 'ready',
    });
  } catch (err) {
    console.error('ingestionPipeline: failed to save AI extraction results', err);
    await failDocument(document, 'database update', err.message ?? String(err));
    return;
  }

  await createNotification({
    userId: document.userId,
    documentId: document._id,
    message: `Document "${title}" has been processed successfully.`,
    type: 'processing_complete',
  });
}
