/**
 * Property-based tests for aiService.extractDocumentData — schema validation.
 *
 * Uses fast-check + @fast-check/vitest.
 *
 * Validates: Requirements 6.5
 *
 * Properties covered:
 *   Property 15 — documentType values outside the allowed enum are treated as schema failures
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fc, test } from '@fast-check/vitest';

// ---------------------------------------------------------------------------
// Mock the OpenAI SDK before importing aiService
// vi.mock is hoisted to the top of the file by Vitest
// ---------------------------------------------------------------------------

vi.mock('openai', () => {
  // We'll hold a reference to the mock so individual tests can configure it
  const mockCreate = vi.fn();

  const MockOpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));

  // Attach the mockCreate reference so tests can reach it via the constructor
  (MockOpenAI as any).__mockCreate = mockCreate;

  return { default: MockOpenAI };
});

// ---------------------------------------------------------------------------
// Import aiService AFTER mocking so it receives the mocked OpenAI constructor
// ---------------------------------------------------------------------------

// @ts-ignore — JS module without type declarations
import * as aiService from '../../services/aiService.js';
import OpenAI from 'openai';

/** Retrieve the shared mockCreate function installed by the vi.mock factory */
function getMockCreate() {
  return (OpenAI as any).__mockCreate as ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Property 15 — documentType values outside the allowed enum are schema failures
// Feature: docket, Property 15
// Validates: Requirements 6.5
// ---------------------------------------------------------------------------

const VALID_DOCUMENT_TYPES = [
  'id',
  'certificate',
  'contract',
  'invoice',
  'insurance',
  'warranty',
  'other',
];

describe('Property 15: documentType values outside the allowed enum are treated as schema failures', () => {
  beforeEach(() => {
    // Reset call history between runs
    getMockCreate().mockReset();
  });

  // Feature: docket, Property 15
  test.prop(
    [
      fc
        .string({ minLength: 1, maxLength: 64 })
        .filter((s) => !VALID_DOCUMENT_TYPES.includes(s)),
    ],
    { numRuns: 100 }
  )(
    'extractDocumentData throws when OpenAI returns an invalid documentType (Validates: Requirements 6.5)',
    async (invalidDocumentType) => {
      // Arrange: mock OpenAI to return a response containing the invalid documentType
      const aiPayload = {
        documentType: invalidDocumentType,
        suggestedTitle: 'Test Document',
        issueDate: null,
        expiryDate: null,
        amount: null,
        issuer: null,
      };

      getMockCreate().mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(aiPayload),
            },
          },
        ],
      });

      // Act + Assert: the call must reject with an Error
      await expect(
        aiService.extractDocumentData('some text')
      ).rejects.toThrow(Error);
    }
  );
});
