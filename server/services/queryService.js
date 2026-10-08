/**
 * queryService — handles AI natural-language query execution and logging.
 *
 * Requirements: 10.1, 10.2, 10.5, 15.5
 */
import Document from '../models/Document.js';
import QueryLog from '../models/QueryLog.js';
import * as aiService from './aiService.js';

/**
 * Handle a user query over their ready documents.
 *
 * @param {string} userId - Authenticated user's ID
 * @param {string} question - User's question string
 * @returns {Promise<{ answer: string, matchedDocumentIds: string[] }>}
 */
export async function handle(userId, question) {
  // Fetch all ready documents scoped exclusively to userId (Requirement 10.1, 15.5)
  const docs = await Document.find({ userId, status: 'ready' })
    .select('_id title documentType issuer issueDate expiryDate amount tags extractedText')
    .lean();

  if (!docs || docs.length === 0) {
    const noDocsAnswer = "You don't have any ready documents in your vault yet. Please upload and process documents before asking questions.";
    await QueryLog.create({
      userId,
      questionText: question,
      answerText: noDocsAnswer,
      matchedDocumentIds: [],
    });
    return {
      answer: noDocsAnswer,
      matchedDocumentIds: [],
    };
  }

  // Map to clean metadata array for AI prompt
  const metadataArray = docs.map((d) => ({
    _id: String(d._id),
    title: d.title,
    documentType: d.documentType,
    issuer: d.issuer,
    issueDate: d.issueDate ? d.issueDate.toISOString().split('T')[0] : null,
    expiryDate: d.expiryDate ? d.expiryDate.toISOString().split('T')[0] : null,
    amount: d.amount,
    tags: d.tags,
    extractedTextSnippet: d.extractedText ? d.extractedText.slice(0, 1000) : '',
  }));

  // Delegate to aiService (Requirement 10.1, 10.4)
  const result = await aiService.answerQuery(metadataArray, question);

  // Persist QueryLog record (Requirement 10.5)
  await QueryLog.create({
    userId,
    questionText: question,
    answerText: result.answer,
    matchedDocumentIds: result.matchedDocumentIds,
  });

  return result;
}
