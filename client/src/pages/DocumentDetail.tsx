/**
 * DocumentDetail — split-layout document viewer and editor.
 *
 * Left  — document preview (iframe for PDF, img for images)
 * Right — editable metadata form + status/action panels
 *
 * Requirements: 8.2, 8.3, 8.5, 8.6, 8.7, 8.8, 8.9
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';
import * as documentsApi from '@/api/documentsApi';
import type { Document } from '@/api/documentsApi';
import ExpiryBadge from '@/components/ExpiryBadge';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { useDocumentPolling } from '@/hooks/useDocumentPolling';
import { toast } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toInputDate(value: string | null | undefined): string {
  if (!value) return '';
  // Accept either ISO string or YYYY-MM-DD
  return value.slice(0, 10);
}

// ---------------------------------------------------------------------------
// DeleteConfirmDialog
// ---------------------------------------------------------------------------
function DeleteConfirmDialog({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  // Trap focus inside the dialog
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-sm rounded-lg bg-card border border-border p-6 shadow-lg space-y-4"
      >
        <h2 id="delete-dialog-title" className="text-lg font-semibold text-foreground">
          Delete document?
        </h2>
        <p className="text-sm text-muted-foreground">
          This action cannot be undone. The document and its stored file will be permanently
          deleted.
        </p>
        <div className="flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocumentDetail
// ---------------------------------------------------------------------------
export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ── Fetch state ────────────────────────────────────────────────────────
  const [doc, setDoc] = useState<Document | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Form state ─────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [amount, setAmount] = useState('');
  const [tags, setTags] = useState(''); // comma-separated
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Delete state ───────────────────────────────────────────────────────
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Retry / polling state ──────────────────────────────────────────────
  const [retryLoading, setRetryLoading] = useState(false);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const { document: polledDoc } = useDocumentPolling(pollingId);

  // ── Review banner ──────────────────────────────────────────────────────
  const [reviewDismissed, setReviewDismissed] = useState(false);

  // ── Load document ──────────────────────────────────────────────────────
  const loadDoc = useCallback(async () => {
    if (!id) return;
    setFetchLoading(true);
    setFetchError(null);
    try {
      const fetched = await documentsApi.get(id);
      setDoc(fetched);
      // Seed form fields
      setTitle(fetched.title ?? '');
      setIssuer(fetched.issuer ?? '');
      setIssueDate(toInputDate(fetched.issueDate));
      setExpiryDate(toInputDate(fetched.expiryDate));
      setAmount(fetched.amount != null ? String(fetched.amount) : '');
      setTags(fetched.tags?.join(', ') ?? '');
    } catch {
      setFetchError('Failed to load document. Please try again.');
    } finally {
      setFetchLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDoc();
  }, [loadDoc]);

  // ── Sync polled doc back into state ────────────────────────────────────
  useEffect(() => {
    if (polledDoc && polledDoc.status !== 'processing') {
      setDoc(polledDoc);
      setPollingId(null);
      // Re-seed form if the doc just became ready
      if (polledDoc.status === 'ready') {
        setTitle(polledDoc.title ?? '');
        setIssuer(polledDoc.issuer ?? '');
        setIssueDate(toInputDate(polledDoc.issueDate));
        setExpiryDate(toInputDate(polledDoc.expiryDate));
        setAmount(polledDoc.amount != null ? String(polledDoc.amount) : '');
        setTags(polledDoc.tags?.join(', ') ?? '');
      }
    }
  }, [polledDoc]);

  // ── Save handler ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!id) return;
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const updated = await documentsApi.update(id, {
        title: title.trim() || undefined,
        issuer: issuer.trim() || null,
        issueDate: issueDate || null,
        expiryDate: expiryDate || null,
        amount: amount !== '' ? parseFloat(amount) : null,
        tags: tagList,
      });
      setDoc(updated);
      setSaveSuccess(true);
      toast.success('Changes saved.');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setSaveError('Failed to save changes. Please try again.');
      toast.error('Failed to save changes.');
    } finally {
      setSaveLoading(false);
    }
  };

  // ── Delete handler ─────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!id) return;
    setDeleteLoading(true);
    try {
      await documentsApi.remove(id);
      toast.success('Document deleted.');
      navigate('/documents', { replace: true });
    } catch {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
      setSaveError('Failed to delete document. Please try again.');
      toast.error('Failed to delete document.');
    }
  };

  // ── Retry handler ──────────────────────────────────────────────────────
  const handleRetry = async () => {
    if (!id) return;
    setRetryLoading(true);
    try {
      await documentsApi.retry(id);
      setDoc((prev) => prev ? { ...prev, status: 'processing', failureReason: null } : prev);
      setPollingId(id); // start polling
      toast.success('Processing restarted.');
    } catch {
      setSaveError('Failed to retry. Please try again.');
      toast.error('Failed to restart processing.');
    } finally {
      setRetryLoading(false);
    }
  };

  // ── Review dismiss handler ─────────────────────────────────────────────
  const handleDismissReview = async () => {
    if (!id) return;
    setReviewDismissed(true);
    try {
      const updated = await documentsApi.update(id, { reviewedByUser: true });
      setDoc(updated);
    } catch {
      // Non-fatal — banner is hidden locally regardless
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (fetchLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <LoadingSkeleton variant="document-card" count={3} />
          <LoadingSkeleton variant="document-card" count={4} />
        </div>
      </div>
    );
  }

  if (fetchError || !doc) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4 text-destructive"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Could not load document</p>
            <p className="mt-0.5 text-sm">{fetchError ?? 'Document not found.'}</p>
          </div>
          <button
            type="button"
            onClick={loadDoc}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const isProcessing = doc.status === 'processing' || pollingId !== null;
  const isFailed = doc.status === 'failed' && pollingId === null;
  const showReviewBanner =
    doc.status === 'ready' && !doc.reviewedByUser && !reviewDismissed;

  return (
    <>
      <AnimatePresence>
        {showDeleteDialog && (
          <DeleteConfirmDialog
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteDialog(false)}
            loading={deleteLoading}
          />
        )}
      </AnimatePresence>

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Back link */}
        <button
          type="button"
          onClick={() => navigate('/documents')}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Documents
        </button>

        {/* Review banner — Requirement 8.5 */}
        {showReviewBanner && (
          <div className="flex items-start justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>Please verify the AI-extracted fields below and confirm they look correct.</span>
            </div>
            <button
              type="button"
              onClick={handleDismissReview}
              className="flex-shrink-0 rounded-md border border-primary/40 bg-background px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              Looks good
            </button>
          </div>
        )}

        {/* Failed state banner — Requirement 8.8 */}
        {isFailed && (
          <div
            role="alert"
            className="flex items-start justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"
          >
            <div className="flex items-start gap-2 text-destructive">
              <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Processing failed</p>
                {doc.failureReason && (
                  <p className="mt-0.5 text-xs">{doc.failureReason}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              disabled={retryLoading}
              className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              {retryLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Retry
            </button>
          </div>
        )}

        {/* Processing banner */}
        {isProcessing && (
          <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-700">
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
            <p className="text-sm">Processing… Fields will update automatically when complete.</p>
          </div>
        )}

        {/* Split layout — Requirement 8.2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

          {/* ── Left: preview panel ───────────────────────────── */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground truncate">{doc.originalFilename}</h2>
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline-offset-4 hover:underline"
              >
                Open original
              </a>
            </div>
            <div className="aspect-[4/5] w-full bg-muted">
              {doc.fileType === 'pdf' ? (
                <iframe
                  src={doc.fileUrl}
                  title={`Preview: ${doc.title}`}
                  className="h-full w-full border-0"
                />
              ) : (
                <img
                  src={doc.fileUrl}
                  alt={doc.title}
                  className="h-full w-full object-contain"
                />
              )}
            </div>
          </div>

          {/* ── Right: metadata form ──────────────────────────── */}
          <div className="space-y-6">
            {/* Header row */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-foreground">{doc.title}</h1>
                <p className="text-sm text-muted-foreground capitalize mt-0.5">{doc.documentType}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteDialog(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-shrink-0"
                aria-label="Delete document"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>

            {/* Global save error */}
            {saveError && (
              <div role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {saveError}
              </div>
            )}

            {/* Save success */}
            {saveSuccess && (
              <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                Changes saved successfully.
              </div>
            )}

            {/* Form — Requirement 8.3 */}
            <div className="space-y-4">

              {/* Title */}
              <div>
                <label htmlFor="doc-title" className="block text-sm font-medium text-foreground mb-1">
                  Title
                </label>
                <input
                  id="doc-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Issuer */}
              <div>
                <label htmlFor="doc-issuer" className="block text-sm font-medium text-foreground mb-1">
                  Issuer
                </label>
                <input
                  id="doc-issuer"
                  type="text"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  placeholder="Organisation or authority"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Issue date */}
              <div>
                <label htmlFor="doc-issue-date" className="block text-sm font-medium text-foreground mb-1">
                  Issue date
                </label>
                <input
                  id="doc-issue-date"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Expiry date + badge */}
              <div>
                <label htmlFor="doc-expiry-date" className="block text-sm font-medium text-foreground mb-1">
                  Expiry date
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="doc-expiry-date"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {expiryDate && <ExpiryBadge expiryDate={expiryDate} />}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label htmlFor="doc-amount" className="block text-sm font-medium text-foreground mb-1">
                  Amount
                </label>
                <input
                  id="doc-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Tags */}
              <div>
                <label htmlFor="doc-tags" className="block text-sm font-medium text-foreground mb-1">
                  Tags
                  <span className="ml-1 text-xs text-muted-foreground">(comma-separated)</span>
                </label>
                <input
                  id="doc-tags"
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="health, 2024, renewal"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Save button */}
              <button
                type="button"
                onClick={handleSave}
                disabled={saveLoading || isProcessing}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
