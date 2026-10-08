import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Image,
  Tag,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  LayoutGrid,
  List,
  Search,
  X,
} from 'lucide-react';
import * as documentsApi from '@/api/documentsApi';
import type { Document } from '@/api/documentsApi';
import UploadDropzone from '@/components/UploadDropzone';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import ExpiryBadge from '@/components/ExpiryBadge';
import { useDocumentPolling } from '@/hooks/useDocumentPolling';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
};

// ---------------------------------------------------------------------------
// Layout persistence key — Requirement 7.2
// ---------------------------------------------------------------------------
const LAYOUT_STORAGE_KEY = 'docket-layout';
type Layout = 'grid' | 'list';

function readLayout(): Layout {
  try {
    const stored = sessionStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored === 'grid' || stored === 'list') return stored;
  } catch {
    // sessionStorage unavailable — fall through to default
  }
  return 'grid';
}

function saveLayout(layout: Layout): void {
  try {
    sessionStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// FileType icon
// ---------------------------------------------------------------------------
function FileTypeIcon({ fileType }: { fileType: Document['fileType'] }) {
  return fileType === 'pdf' ? (
    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-100 text-red-600 flex-shrink-0">
      <FileText className="h-5 w-5" />
    </div>
  ) : (
    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-100 text-blue-600 flex-shrink-0">
      <Image className="h-5 w-5" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge — Requirement 7.2
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: Document['status'] }) {
  const variants: Record<
    Document['status'],
    { label: string; className: string; icon: React.ReactNode }
  > = {
    ready: {
      label: 'Ready',
      className: 'bg-green-100 text-green-700',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    processing: {
      label: 'Processing',
      className: 'bg-yellow-100 text-yellow-700',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    failed: {
      label: 'Failed',
      className: 'bg-red-100 text-red-700',
      icon: <XCircle className="h-3 w-3" />,
    },
  };

  const v = variants[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${v.className}`}
    >
      {v.icon}
      {v.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DocumentCard — static, navigates to detail page
// ---------------------------------------------------------------------------
function DocumentCard({
  doc,
  onClick,
  isList,
}: {
  doc: Document;
  onClick: (id: string) => void;
  isList?: boolean;
}) {
  return (
    <article
      className={`rounded-lg border border-border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isList ? 'flex flex-row items-center gap-4' : 'flex flex-col gap-3'
      }`}
      role="button"
      tabIndex={0}
      aria-label={`Open document: ${doc.title}`}
      onClick={() => onClick(doc._id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(doc._id);
        }
      }}
    >
      {/* Icon */}
      <FileTypeIcon fileType={doc.fileType} />

      {/* Main content */}
      <div className={`flex-1 min-w-0 ${isList ? '' : 'flex flex-col gap-3'}`}>
        {isList ? (
          /* List layout: single row */
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-card-foreground truncate" title={doc.title}>
                {doc.title}
              </h3>
              <p className="text-xs text-muted-foreground capitalize">{doc.documentType}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {doc.expiryDate && <ExpiryBadge expiryDate={doc.expiryDate} />}
              <StatusBadge status={doc.status} />
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatDate(doc.createdAt)}
              </span>
            </div>
            {doc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {doc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Grid layout: stacked */
          <>
            {/* Header: title + status */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-card-foreground truncate" title={doc.title}>
                  {doc.title}
                </h3>
                <p className="text-xs text-muted-foreground capitalize mt-0.5">
                  {doc.documentType}
                </p>
              </div>
              <StatusBadge status={doc.status} />
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Metadata: date + expiry */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                {formatDate(doc.createdAt)}
              </span>
              {doc.expiryDate && <ExpiryBadge expiryDate={doc.expiryDate} />}
            </div>

            {/* Tags — Requirement 7.7 */}
            {doc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {doc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// ProcessingDocumentCard — Requirement 5.3, 6.6, 7.6
// Polls the document status every 3 s while processing, updates in real time,
// and prevents navigation until the document reaches ready or failed state.
// ---------------------------------------------------------------------------
function ProcessingDocumentCard({
  initialDoc,
  onStatusChange,
  isList,
}: {
  initialDoc: Document;
  onStatusChange: (updated: Document) => void;
  isList?: boolean;
}) {
  // Only poll while the document is in processing state — Requirement 5.3
  const { document: polledDoc } = useDocumentPolling(
    initialDoc.status === 'processing' ? initialDoc._id : null,
  );

  // The displayed document is the polled result (if available) or the initial doc
  const doc = polledDoc ?? initialDoc;

  // When polling produces a terminal state, notify the parent list so the card
  // is replaced with a navigable DocumentCard — Requirement 6.6
  const toastedRef = useRef(false);
  useEffect(() => {
    if (polledDoc && polledDoc.status !== 'processing') {
      onStatusChange(polledDoc);
      if (!toastedRef.current) {
        toastedRef.current = true;
        if (polledDoc.status === 'ready') toast.success(`"${polledDoc.title}" is ready.`);
        else toast.error(`Processing failed for "${polledDoc.title}".`);
      }
    }
  }, [polledDoc, onStatusChange]);

  return (
    // Requirement 7.6: card is visually disabled and not interactive while processing
    <article
      className={`rounded-lg border border-border bg-card p-4 opacity-70 cursor-not-allowed select-none ${
        isList ? 'flex flex-row items-center gap-4' : 'flex flex-col gap-3'
      }`}
      aria-label={`Document processing: ${doc.title}`}
      aria-disabled="true"
      role="article"
    >
      {/* Processing overlay indicator */}
      <div className="flex items-center gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-1.5 text-xs font-medium text-yellow-700">
        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" aria-hidden="true" />
        <span>Processing… This may take up to a minute</span>
      </div>

      {/* Header: icon + title + status */}
      <div className="flex items-start gap-3">
        <FileTypeIcon fileType={doc.fileType} />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-card-foreground truncate" title={doc.title}>
            {doc.title}
          </h3>
          <p className="text-xs text-muted-foreground capitalize mt-0.5">
            {doc.documentType}
          </p>
        </div>
        <StatusBadge status={doc.status} />
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Metadata: date */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          {formatDate(doc.createdAt)}
        </span>
        {doc.expiryDate && <ExpiryBadge expiryDate={doc.expiryDate} />}
      </div>

      {/* Tags */}
      {doc.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {doc.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// PollingDocumentCard — Requirement 5.3, 6.6, 7.6
// Smart wrapper that renders ProcessingDocumentCard for processing docs and
// DocumentCard for ready/failed docs. Exported for reuse if needed.
// ---------------------------------------------------------------------------
export function PollingDocumentCard({
  doc,
  onDocumentUpdate,
  onNavigate,
  isList,
}: {
  doc: Document;
  onDocumentUpdate: (updated: Document) => void;
  onNavigate: (id: string) => void;
  isList?: boolean;
}) {
  if (doc.status === 'processing') {
    return (
      <ProcessingDocumentCard
        initialDoc={doc}
        onStatusChange={onDocumentUpdate}
        isList={isList}
      />
    );
  }

  return <DocumentCard doc={doc} onClick={onNavigate} isList={isList} />;
}

// ---------------------------------------------------------------------------
// FilterChips — Requirement 7.3
// ---------------------------------------------------------------------------
interface FilterChipsProps {
  types: string[];
  tags: string[];
  activeFilters: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
}

function FilterChips({ types, tags, activeFilters, onToggle, onClear }: FilterChipsProps) {
  if (types.length === 0 && tags.length === 0) return null;

  const hasActive = activeFilters.size > 0;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter documents">
      {types.map((type) => {
        const active = activeFilters.has(`type:${type}`);
        return (
          <button
            key={`type:${type}`}
            type="button"
            onClick={() => onToggle(`type:${type}`)}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring capitalize ${
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
            }`}
            aria-pressed={active}
          >
            {type}
          </button>
        );
      })}

      {tags.map((tag) => {
        const active = activeFilters.has(`tag:${tag}`);
        return (
          <button
            key={`tag:${tag}`}
            type="button"
            onClick={() => onToggle(`tag:${tag}`)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
            }`}
            aria-pressed={active}
          >
            <Tag className="h-2.5 w-2.5" />
            {tag}
          </button>
        );
      })}

      {hasActive && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocumentsLibrary page — Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 9.5–9.8
// ---------------------------------------------------------------------------
export default function DocumentsLibrary() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  // Search state — Requirements 9.5, 9.6, 9.7, 9.8
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<Document[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Ref to cancel stale in-flight search requests
  const searchAbortRef = useRef<AbortController | null>(null);

  const navigate = useNavigate();

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await documentsApi.list();
      setDocuments(data.documents);
    } catch {
      setError('Failed to load documents. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount — Requirement 7.2
  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Run search when debouncedSearch changes — Requirements 9.6, 9.7, 9.8
  useEffect(() => {
    // Cancel any previous in-flight request
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }

    if (!debouncedSearch || debouncedSearch.trim().length < 2) {
      // Empty or too-short query → restore browse mode
      setSearchResults(null);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    // Extract active type and tag filters to pass to search API
    let activeType: string | undefined;
    let activeTag: string | undefined;
    for (const filter of activeFilters) {
      if (filter.startsWith('type:') && !activeType) activeType = filter.slice(5);
      if (filter.startsWith('tag:') && !activeTag) activeTag = filter.slice(4);
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearchLoading(true);
    setSearchError(null);

    documentsApi
      .search(debouncedSearch.trim(), activeType, activeTag)
      .then((results) => {
        if (!controller.signal.aborted) {
          setSearchResults(results);
          setSearchLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          const msg =
            err instanceof Error ? err.message : 'Search failed. Please try again.';
          setSearchError(msg);
          setSearchLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Persist layout choice — Requirement 7.2
  const handleLayoutChange = useCallback((next: Layout) => {
    setLayout(next);
    saveLayout(next);
  }, []);

  // Called by UploadDropzone on a successful upload — refresh the list
  const handleUploadSuccess = useCallback(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Called by PollingDocumentCard when a document transitions out of processing.
  // Updates the specific document in-place in the list — Requirement 6.6
  const handleDocumentUpdate = useCallback((updated: Document) => {
    setDocuments((prev) =>
      prev.map((d) => (d._id === updated._id ? updated : d)),
    );
  }, []);

  // Navigate to document detail — only called for ready/failed documents
  const handleNavigate = useCallback(
    (id: string) => {
      navigate(`/documents/${id}`);
    },
    [navigate],
  );

  // Derive unique types and tags from loaded documents — Requirement 7.3
  const { uniqueTypes, uniqueTags } = useMemo(() => {
    const types = new Set<string>();
    const tags = new Set<string>();
    for (const doc of documents) {
      if (doc.documentType) types.add(doc.documentType);
      for (const tag of doc.tags) tags.add(tag);
    }
    return {
      uniqueTypes: Array.from(types).sort(),
      uniqueTags: Array.from(tags).sort(),
    };
  }, [documents]);

  // Toggle a filter chip on/off — Requirement 7.3
  const handleToggleFilter = useCallback((value: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setActiveFilters(new Set());
  }, []);

  // Clear search input — Requirement 9.5
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Client-side filtering — Requirement 7.3
  const filteredDocuments = useMemo(() => {
    if (activeFilters.size === 0) return documents;
    return documents.filter((doc) => {
      for (const filter of activeFilters) {
        if (filter.startsWith('type:') && doc.documentType === filter.slice(5)) return true;
        if (filter.startsWith('tag:') && doc.tags.includes(filter.slice(4))) return true;
      }
      return false;
    });
  }, [documents, activeFilters]);

  const isList = layout === 'list';

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload and manage your personal document vault.
          </p>
        </div>

        {/* Grid / List toggle — Requirement 7.2 */}
        <div
          className="flex items-center gap-1 rounded-md border border-border bg-muted p-1"
          role="group"
          aria-label="View layout"
        >
          <button
            type="button"
            onClick={() => handleLayoutChange('grid')}
            className={`rounded p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              layout === 'grid'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-pressed={layout === 'grid'}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleLayoutChange('list')}
            className={`rounded p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              layout === 'list'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-pressed={layout === 'list'}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Upload area — Requirement 4.7, 4.8 */}
      <UploadDropzone onSuccess={handleUploadSuccess} />

      {/* Search input — Requirements 9.5, 9.6, 9.7 */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          {searchLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documents…"
          aria-label="Search documents"
          className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleClearSearch}
            aria-label="Clear search"
            className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter chips — Requirement 7.3 (shown in browse mode only) */}
      {searchResults === null && !loading && !error && documents.length > 0 && (
        <FilterChips
          types={uniqueTypes}
          tags={uniqueTags}
          activeFilters={activeFilters}
          onToggle={handleToggleFilter}
          onClear={handleClearFilters}
        />
      )}

      {/* Document grid / list */}
      <section aria-label="Document library">
        {/* Loading state — Requirement 7.5: 6 skeleton cards */}
        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <LoadingSkeleton variant="document-card" count={6} />
          </div>
        )}

        {/* Error state (list load failure) */}
        {!loading && error && (
          <div
            className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4 text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Something went wrong</p>
              <p className="mt-0.5 text-sm">{error}</p>
            </div>
            <button
              type="button"
              onClick={loadDocuments}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive/50 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* ── SEARCH MODE (searchResults !== null) ── */}

        {/* Search error */}
        {!loading && !error && searchResults !== null && searchError && (
          <div
            className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4 text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p className="flex-1 text-sm">{searchError}</p>
          </div>
        )}

        {/* Search results — Requirement 9.5 */}
        {!loading && !error && searchResults !== null && !searchError && searchResults.length > 0 && (
          <motion.div
            className={
              isList
                ? 'flex flex-col gap-3'
                : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
            }
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {searchResults.map((doc) => (
              <motion.div key={doc._id} variants={cardVariants}>
                <PollingDocumentCard
                  doc={doc}
                  onDocumentUpdate={handleDocumentUpdate}
                  onNavigate={handleNavigate}
                  isList={isList}
                />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Search empty state — Requirement 9.8 */}
        {!loading && !error && searchResults !== null && !searchError && searchResults.length === 0 && !searchLoading && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center">
            <Search className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 font-medium text-muted-foreground">
              No documents matched your search
            </p>
            <button
              type="button"
              onClick={handleClearSearch}
              className="mt-3 inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear search
            </button>
          </div>
        )}

        {/* ── BROWSE MODE (searchResults === null) ── */}

        {/* Loaded: document cards — Requirement 7.2, 7.3, 7.6, 7.7 */}
        {!loading && !error && searchResults === null && filteredDocuments.length > 0 && (
          <motion.div
            className={
              isList
                ? 'flex flex-col gap-3'
                : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
            }
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {filteredDocuments.map((doc) => (
              <motion.div key={doc._id} variants={cardVariants}>
                <PollingDocumentCard
                  doc={doc}
                  onDocumentUpdate={handleDocumentUpdate}
                  onNavigate={handleNavigate}
                  isList={isList}
                />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Filtered empty state — Requirement 7.4 */}
        {!loading && !error && searchResults === null && documents.length > 0 && filteredDocuments.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 font-medium text-muted-foreground">
              No documents match the current filters
            </p>
            <button
              type="button"
              onClick={handleClearFilters}
              className="mt-3 inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* No documents at all — original empty state */}
        {!loading && !error && searchResults === null && documents.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 font-medium text-muted-foreground">No documents yet</p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Upload a file above to get started.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
