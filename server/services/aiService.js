/**
 * aiService — the single module that imports the OpenAI SDK.
 *
 * All three public functions centralise every AI call:
 *   - extractTextFromImage  — vision API for image documents
 *   - extractDocumentData   — classification + field extraction (stub → implemented in Task 16.1)
 *   - answerQuery           — natural-language Q&A over document metadata (stub → Task 27.1)
 *
 * Requirements: 5.2, 6.1, 6.5, 10.1, 10.4
 */
import OpenAI from 'openai';

// Lazy-initialise the client so tests can set OPENAI_API_KEY after import
let _openai = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ---------------------------------------------------------------------------
// extractTextFromImage — vision API (Requirement 5.2)
// ---------------------------------------------------------------------------

/**
 * Send an image URL to the OpenAI vision endpoint and return the extracted text.
 *
 * @param {string} fileUrl - Publicly accessible URL of the image (from Cloudinary)
 * @returns {Promise<string>} Extracted text content
 * @throws {Error} If the API call fails
 */
export async function extractTextFromImage(fileUrl) {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Please extract all text content from this image. Return the raw text only, preserving line breaks where present.',
          },
          {
            type: 'image_url',
            image_url: { url: fileUrl, detail: 'high' },
          },
        ],
      },
    ],
    max_tokens: 4096,
  });

  return response.choices[0]?.message?.content ?? '';
}

// ---------------------------------------------------------------------------
// extractDocumentData — Requirements: 6.1, 6.5
// ---------------------------------------------------------------------------

/**
 * Valid document types as defined in the ExtractionResult schema.
 * @type {string[]}
 */
const VALID_DOCUMENT_TYPES = [
  'id',
  'certificate',
  'contract',
  'invoice',
  'insurance',
  'warranty',
  'other',
];

/**
 * Regex for validating YYYY-MM-DD date strings.
 * @type {RegExp}
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate an AI response object against the ExtractionResult schema.
 * Throws a descriptive Error if any field fails validation.
 *
 * @param {unknown} data - Parsed JSON from the AI response
 * @returns {{ documentType: string, suggestedTitle: string, issueDate: string|null, expiryDate: string|null, amount: number|null, issuer: string|null }}
 */
function validateExtractionResult(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('AI response is not a JSON object');
  }

  // documentType — must be one of the allowed enum values (Requirement 6.5)
  if (!VALID_DOCUMENT_TYPES.includes(data.documentType)) {
    throw new Error(
      `Invalid documentType "${data.documentType}"; must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}`
    );
  }

  // suggestedTitle — must be a non-empty string
  if (typeof data.suggestedTitle !== 'string' || data.suggestedTitle.trim() === '') {
    throw new Error('suggestedTitle must be a non-empty string');
  }

  // issueDate — YYYY-MM-DD string or null
  if (data.issueDate !== null && data.issueDate !== undefined) {
    if (typeof data.issueDate !== 'string' || !DATE_RE.test(data.issueDate)) {
      throw new Error(`issueDate must be a YYYY-MM-DD string or null; got "${data.issueDate}"`);
    }
  }

  // expiryDate — YYYY-MM-DD string or null
  if (data.expiryDate !== null && data.expiryDate !== undefined) {
    if (typeof data.expiryDate !== 'string' || !DATE_RE.test(data.expiryDate)) {
      throw new Error(`expiryDate must be a YYYY-MM-DD string or null; got "${data.expiryDate}"`);
    }
  }

  // amount — number or null
  if (data.amount !== null && data.amount !== undefined) {
    if (typeof data.amount !== 'number' || Number.isNaN(data.amount)) {
      throw new Error(`amount must be a number or null; got "${data.amount}"`);
    }
  }

  // issuer — string or null (no further constraints)
  if (data.issuer !== null && data.issuer !== undefined && typeof data.issuer !== 'string') {
    throw new Error(`issuer must be a string or null; got "${data.issuer}"`);
  }

  return {
    documentType: data.documentType,
    suggestedTitle: data.suggestedTitle.trim(),
    issueDate: data.issueDate ?? null,
    expiryDate: data.expiryDate ?? null,
    amount: data.amount ?? null,
    issuer: data.issuer ?? null,
  };
}

/**
 * Classify a document and extract structured fields from its text.
 *
 * Calls the OpenAI chat completions API with JSON-mode enabled and validates
 * the response against the ExtractionResult schema. Throws on schema failure
 * so the IngestionPipeline's retry logic can catch it.
 *
 * @param {string} extractedText - The full text content of the document
 * @returns {Promise<{ documentType: string, suggestedTitle: string, issueDate: string|null, expiryDate: string|null, amount: number|null, issuer: string|null }>}
 * @throws {Error} If the API call fails or the response fails schema validation
 */
export async function extractDocumentData(extractedText) {
  const openai = getOpenAI();

  const systemPrompt = `You are a document intelligence assistant. Your task is to classify a document and extract structured metadata from its text content.

You MUST respond with a single valid JSON object — no markdown, no extra text, just the JSON.

The JSON object must have exactly these fields:
- "documentType": one of "id", "certificate", "contract", "invoice", "insurance", "warranty", "other"
- "suggestedTitle": a concise, descriptive title for the document (non-empty string, e.g. "Driver's License - John Smith" or "Health Insurance Policy 2024")
- "issueDate": the date the document was issued in YYYY-MM-DD format, or null if not found
- "expiryDate": the date the document expires in YYYY-MM-DD format, or null if not found
- "amount": the primary monetary amount as a number (e.g. 1500.00), or null if not applicable
- "issuer": the name of the issuing organization or authority as a string, or null if not found

Guidelines:
- Choose the most specific documentType that fits. Use "other" only if none of the others apply.
- For suggestedTitle, be concise but informative — include the issuer or person name if available.
- All dates must be in YYYY-MM-DD format. Do not guess dates; use null if uncertain.
- For amount, return only the primary monetary value as a plain number, no currency symbols.`;

  const userPrompt = `Extract metadata from the following document text:\n\n${extractedText}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 512,
  });

  const rawContent = response.choices[0]?.message?.content ?? '{}';
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`AI response was not valid JSON: ${rawContent}`);
  }

  // validateExtractionResult throws if the schema is not satisfied (Requirement 6.5)
  return validateExtractionResult(parsed);
}

// ---------------------------------------------------------------------------
// answerQuery — stub (full implementation in Task 27.1)
// Requirements: 10.1, 10.4
// ---------------------------------------------------------------------------

/**
 * Answer a natural-language question using document metadata.
 *
 * Requirements: 10.1, 10.4
 *
 * @param {object[]} metadataArray - Lightweight document metadata array
 * @param {string} question - User's question
 * @returns {Promise<{ answer: string, matchedDocumentIds: string[] }>} Answer text and matched document IDs
 */
export async function answerQuery(metadataArray, question) {
  const openai = getOpenAI();

  const systemPrompt = `You are a helpful personal document intelligence assistant. The user has provided a JSON array representing their document vault metadata and text, along with a question.

Your task is to analyze the documents provided and accurately answer the user's question.

You MUST respond with a single valid JSON object containing exactly these fields:
- "answer": a concise, direct, helpful natural-language answer to the user's question based ONLY on the provided documents. If no relevant information is found, state that clearly.
- "matchedDocumentIds": an array of string document IDs (_id values) from the provided list that were relevant or referenced in your answer. Return an empty array [] if no documents matched.`;

  const userPrompt = `Documents Vault Metadata:\n${JSON.stringify(metadataArray, null, 2)}\n\nUser Question:\n${question}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1024,
  });

  const rawContent = response.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(rawContent);
    return {
      answer: typeof parsed.answer === 'string' ? parsed.answer : 'No answer generated.',
      matchedDocumentIds: Array.isArray(parsed.matchedDocumentIds) ? parsed.matchedDocumentIds : [],
    };
  } catch {
    return {
      answer: rawContent || 'Unable to parse answer from AI response.',
      matchedDocumentIds: [],
    };
  }
}
