/**
 * pdfService — text extraction from PDF buffers.
 *
 * Uses `pdf-parse` to extract the text layer from a PDF file buffer.
 * Returns an empty string if there is no parseable text layer or if
 * any error occurs — the IngestionPipeline treats an empty result as a
 * failure per Requirement 5.5.
 *
 * Requirements: 5.1, 5.5
 */
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

/**
 * Extract text from a PDF file buffer.
 *
 * @param {Buffer} fileBuffer - Raw PDF file bytes
 * @returns {Promise<string>} Extracted text, or '' on empty/failure
 */
export async function extractText(fileBuffer) {
  try {
    const data = await pdfParse(fileBuffer);
    // data.text may be an empty string if the PDF has no text layer
    return typeof data.text === 'string' ? data.text : '';
  } catch {
    // Any parse error (encrypted PDF, corrupt file, etc.) → return ''
    // Caller handles empty string as a failure condition (Req 5.5)
    return '';
  }
}
