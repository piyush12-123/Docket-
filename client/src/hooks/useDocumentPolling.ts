import { useState, useEffect, useRef } from 'react';
import { type Document, get } from '@/api/documentsApi';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 60_000;

/**
 * Polls `documentsApi.get(id)` every 3 seconds until the document status
 * reaches `'ready'` or `'failed'`, or 60 seconds have elapsed.
 *
 * @param id - Document ID to poll, or null/undefined to skip polling.
 * @returns `{ document, isPolling }` — the latest fetched document and
 *          whether polling is currently active.
 *
 * Requirement 5.3
 */
export function useDocumentPolling(
  id: string | null | undefined,
): { document: Document | null; isPolling: boolean } {
  const [document, setDocument] = useState<Document | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Refs so interval/timeout callbacks always see current values without
  // needing to be re-registered.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) {
      setDocument(null);
      setIsPolling(false);
      return;
    }

    let stopped = false;

    const stopPolling = () => {
      stopped = true;
      setIsPolling(false);
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const poll = async () => {
      if (stopped) return;
      try {
        const doc = await get(id);
        if (stopped) return; // id may have changed while awaiting
        setDocument(doc);
        if (doc.status === 'ready' || doc.status === 'failed') {
          stopPolling();
        }
      } catch {
        // Network errors are swallowed; polling continues until the timeout.
      }
    };

    setIsPolling(true);

    // Fire first poll immediately, then on each interval tick.
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    // Hard stop after MAX_POLL_DURATION_MS.
    timeoutRef.current = setTimeout(stopPolling, MAX_POLL_DURATION_MS);

    return () => {
      stopPolling();
    };
  }, [id]);

  return { document, isPolling };
}
