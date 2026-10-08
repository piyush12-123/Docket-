import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useDocumentPolling } from './useDocumentPolling';
import * as documentsApi from '@/api/documentsApi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDocument(
  overrides: Partial<documentsApi.Document> = {},
): documentsApi.Document {
  return {
    _id: 'doc-1',
    userId: 'user-1',
    title: 'Test Doc',
    originalFilename: 'test.pdf',
    fileUrl: 'https://example.com/test.pdf',
    fileType: 'pdf',
    documentType: 'other',
    issuer: null,
    issueDate: null,
    expiryDate: null,
    amount: null,
    tags: [],
    status: 'processing',
    failureReason: null,
    reviewedByUser: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDocumentPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does nothing when id is null', () => {
    const getSpy = vi.spyOn(documentsApi, 'get');
    const { result } = renderHook(() => useDocumentPolling(null));

    expect(result.current.document).toBeNull();
    expect(result.current.isPolling).toBe(false);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('does nothing when id is undefined', () => {
    const getSpy = vi.spyOn(documentsApi, 'get');
    const { result } = renderHook(() => useDocumentPolling(undefined));

    expect(result.current.document).toBeNull();
    expect(result.current.isPolling).toBe(false);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('starts polling immediately when id is provided', async () => {
    const processingDoc = makeDocument({ status: 'processing' });
    vi.spyOn(documentsApi, 'get').mockResolvedValue(processingDoc);

    const { result } = renderHook(() => useDocumentPolling('doc-1'));

    // isPolling is set synchronously
    expect(result.current.isPolling).toBe(true);

    // Drain the first immediate poll
    await act(() => vi.runAllTimersAsync());

    expect(result.current.document).toEqual(processingDoc);
  });

  it('stops polling when status becomes ready', async () => {
    const readyDoc = makeDocument({ status: 'ready' });
    vi.spyOn(documentsApi, 'get').mockResolvedValue(readyDoc);

    const { result } = renderHook(() => useDocumentPolling('doc-1'));

    await act(() => vi.runAllTimersAsync());

    expect(result.current.document?.status).toBe('ready');
    expect(result.current.isPolling).toBe(false);
  });

  it('stops polling when status becomes failed', async () => {
    const failedDoc = makeDocument({ status: 'failed', failureReason: 'OCR error' });
    vi.spyOn(documentsApi, 'get').mockResolvedValue(failedDoc);

    const { result } = renderHook(() => useDocumentPolling('doc-1'));

    await act(() => vi.runAllTimersAsync());

    expect(result.current.document?.status).toBe('failed');
    expect(result.current.isPolling).toBe(false);
  });

  it('polls again after 3 seconds while still processing', async () => {
    const processingDoc = makeDocument({ status: 'processing' });
    const getSpy = vi.spyOn(documentsApi, 'get').mockResolvedValue(processingDoc);

    renderHook(() => useDocumentPolling('doc-1'));

    // First immediate poll (advance 0ms just to flush microtasks)
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(getSpy).toHaveBeenCalledTimes(1);

    // Advance 3 seconds → second poll fires
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(getSpy).toHaveBeenCalledTimes(2);

    // Advance another 3 seconds → third poll fires
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(getSpy).toHaveBeenCalledTimes(3);
  });

  it('stops polling after 60 seconds even if still processing', async () => {
    const processingDoc = makeDocument({ status: 'processing' });
    vi.spyOn(documentsApi, 'get').mockResolvedValue(processingDoc);

    const { result } = renderHook(() => useDocumentPolling('doc-1'));

    // Advance past the 60-second timeout
    await act(async () => {
      vi.advanceTimersByTime(60_001);
      await vi.runAllTimersAsync();
    });

    expect(result.current.isPolling).toBe(false);
  });

  it('cleans up interval on unmount', async () => {
    const processingDoc = makeDocument({ status: 'processing' });
    vi.spyOn(documentsApi, 'get').mockResolvedValue(processingDoc);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = renderHook(() => useDocumentPolling('doc-1'));

    await act(() => vi.runAllTimersAsync());

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('resets state when id changes to null', async () => {
    const readyDoc = makeDocument({ status: 'ready' });
    vi.spyOn(documentsApi, 'get').mockResolvedValue(readyDoc);

    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useDocumentPolling(id),
      { initialProps: { id: 'doc-1' as string | null } },
    );

    await act(() => vi.runAllTimersAsync());
    expect(result.current.document).not.toBeNull();

    // Switch id to null
    rerender({ id: null });

    expect(result.current.document).toBeNull();
    expect(result.current.isPolling).toBe(false);
  });

  it('continues polling despite network errors', async () => {
    const getSpy = vi
      .spyOn(documentsApi, 'get')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(makeDocument({ status: 'processing' }));

    const { result } = renderHook(() => useDocumentPolling('doc-1'));

    // First poll fails silently — advance 0ms to flush the immediate poll
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.isPolling).toBe(true);

    // Second poll after 3 seconds succeeds
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(result.current.document).not.toBeNull();
  });
});
