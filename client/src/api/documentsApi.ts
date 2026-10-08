import apiClient from './apiClient';

/**
 * Document shape returned by the API.
 * Fields are kept loose so this file can be extended in later phases.
 */
export interface Document {
  _id: string;
  userId: string;
  title: string;
  originalFilename: string;
  fileUrl: string;
  fileType: 'pdf' | 'image';
  extractedText?: string;
  documentType:
    | 'id'
    | 'certificate'
    | 'contract'
    | 'invoice'
    | 'insurance'
    | 'warranty'
    | 'other';
  issuer: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  amount: number | null;
  tags: string[];
  status: 'processing' | 'ready' | 'failed';
  failureReason: string | null;
  reviewedByUser: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResponse {
  documentId: string;
  status: string;
}

export interface PaginatedDocuments {
  documents: Document[];
  total: number;
  page: number;
  limit: number;
}

export interface ListParams {
  page?: number;
  limit?: number;
}

export interface QueryResponse {
  answer: string;
  matchedDocumentIds: string[];
}

/**
 * Upload a file to POST /api/documents.
 * Accepts an `onUploadProgress` callback so callers can track percentage.
 * Returns { documentId, status } (HTTP 202) — Requirement 4.4.
 */
export async function upload(
  formData: FormData,
  onUploadProgress?: (progressEvent: { loaded: number; total?: number }) => void,
): Promise<UploadResponse> {
  const response = await apiClient.post<UploadResponse>(
    '/api/documents',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    },
  );
  return response.data;
}

/**
 * Fetch the authenticated user's documents.
 * GET /api/documents — Requirement 7.1
 */
export async function list(params?: ListParams): Promise<PaginatedDocuments> {
  const response = await apiClient.get<PaginatedDocuments>('/api/documents', {
    params,
  });
  return response.data;
}

/**
 * Search documents by keyword with optional type/tag filters.
 * GET /api/documents/search — Requirement 9.2
 */
export async function search(
  query: string,
  type?: string,
  tag?: string,
): Promise<Document[]> {
  const response = await apiClient.get<Document[]>('/api/documents/search', {
    params: { q: query, type, tag },
  });
  return response.data;
}

/**
 * Fetch a single document by ID.
 * GET /api/documents/:id — Requirement 8.1
 */
export async function get(id: string): Promise<Document> {
  const response = await apiClient.get<Document>(`/api/documents/${id}`);
  return response.data;
}

/**
 * Update a document's editable fields.
 * PATCH /api/documents/:id — Requirement 8.3
 */
export async function update(
  id: string,
  fields: Partial<
    Pick<Document, 'title' | 'issuer' | 'issueDate' | 'expiryDate' | 'amount' | 'tags'> & {
      reviewedByUser?: boolean;
    }
  >,
): Promise<Document> {
  const response = await apiClient.patch<Document>(
    `/api/documents/${id}`,
    fields,
  );
  return response.data;
}

/**
 * Delete a document.
 * DELETE /api/documents/:id — Requirement 8.7
 */
export async function remove(id: string): Promise<void> {
  await apiClient.delete(`/api/documents/${id}`);
}

/**
 * Retry ingestion on a failed document.
 * POST /api/documents/:id/retry — Requirement 8.9
 */
export async function retry(id: string): Promise<{ status: string }> {
  const response = await apiClient.post<{ status: string }>(
    `/api/documents/${id}/retry`,
  );
  return response.data;
}

/**
 * Ask a natural-language question about documents.
 * POST /api/documents/query — Requirement 10.1
 */
export async function query(question: string): Promise<QueryResponse> {
  const response = await apiClient.post<QueryResponse>(
    '/api/documents/query',
    { question },
  );
  return response.data;
}
