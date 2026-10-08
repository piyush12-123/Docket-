/**
 * SearchService
 *
 * Executes MongoDB $text queries against the Document collection, scoped to
 * the authenticated user.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
import Document from '../models/Document.js';

/**
 * Minimum query length enforced by Req 9.2.
 */
const MIN_QUERY_LENGTH = 2;

/**
 * search — performs a full-text search over the authenticated user's documents.
 *
 * @param {string} userId  — The authenticated user's ID (derived from JWT, Req 15.1).
 * @param {string} query   — The search string; must be at least 2 characters.
 * @param {string} [type]  — Optional documentType filter (Req 9.3).
 * @param {string} [tag]   — Optional tag filter; combined with type when both present (Req 9.4).
 * @returns {Promise<Document[]>} — Matching Document records belonging to userId.
 * @throws {Error} — If query is shorter than MIN_QUERY_LENGTH characters.
 */
export async function search(userId, query, type, tag) {
  // Req 9.2: validate query length
  if (!query || query.length < MIN_QUERY_LENGTH) {
    const err = new Error(`Search query must be at least ${MIN_QUERY_LENGTH} characters.`);
    err.statusCode = 400;
    throw err;
  }

  // Base filter: $text search scoped to the authenticated user (Req 9.2, 15.2)
  const filter = {
    userId,
    $text: { $search: query },
  };

  // Req 9.3: apply optional documentType filter
  if (type) {
    filter.documentType = type;
  }

  // Req 9.4: apply optional tags filter (combined with type when both present)
  if (tag) {
    filter.tags = tag;
  }

  const documents = await Document.find(filter, {
    // Include text relevance score so callers can sort by relevance if desired
    score: { $meta: 'textScore' },
  }).sort({ score: { $meta: 'textScore' } });

  return documents;
}
